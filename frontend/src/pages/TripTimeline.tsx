import React, { useEffect, useMemo, useRef, useState } from "react";
import VTLoader from "../components/VTLoader";
import ReactDOM from "react-dom";
import ScheduleDateTimePicker from "../components/ScheduleDateTimePicker";
import TripDateTimePickerPanel from "../components/TripDateTimePickerPanel";
import "react-datepicker/dist/react-datepicker.css";
import {
  buildApiUrl,
  getApiKey,
  getTenantId,
  getAssetsFromApi,
  getTraccarDevices,
  getTraccarEvents,
  getTraccarRoute,
  getTraccarTrips,
  type TraccarEvent,
  type TraccarRoutePoint
} from "../utils/api";
import { resolveAssetDriverName, resolveTripDriverName } from "../utils/assetDriver";
import { toCanonicalNotificationDescription } from "../data/notificationLibrary";
import { matchesStoredSiteSelection, readStoredSelectionScope } from "../utils/selectionScope";
import { beginSaving, endSavingDone, endSavingError } from "../utils/saveFeedback";
import {
  buildFuelTrendFromRoute,
  extractFuelLitersFromPayload,
  extractIgnitionFromPayload,
  filterFuelChangePointsForMotion,
  formatFuelChartTime
} from "../utils/traccarFuel";
import {
  fuelAxisBounds,
  stabilizeFuelTrend,
  type FuelChangePoint,
  type FuelTrendPoint
} from "../utils/fuelTrendStabilizer";
import {
  cms808TripSourceAvailable,
  CMS808_KNOWN_VEHICLE,
  loadCms808TimelineTripsForDevice,
  loadCms808MileageDetail,
  mapCms808MileageRowsToTimelineTrips,
  resolveCms808DeviceId
} from "../utils/cms808";
import { buildTachoPoints, tachoAxisMax, thinTachoPathPoints, toRpmRevPerSec } from "../utils/tachoSeries";
import {
  eventMatchesAllowedLabels,
  registerBoundNotificationAliases,
  traccarEventToLabel
} from "../utils/streamLive";
import { TIMELINE_ROW_ORDER } from "../utils/tripTimelineRows";

type TimelineTrip = {
  driver: string;
  registration: string;
  start: string;
  end: string;
  duration: string;
  distance: string;
  maxSpeed: string;
  fuelUsed: string;
  segments: { start: string; end: string; type: "moving" | "idle" }[];
};

type NotificationEvent = {
  id: string;
  at: string;
  durationMinutes?: number;
  tripIndex: number;
  ignitionState?: "on" | "off";
  location?: string;
  eventValue?: string;
};

type RawTimelineNotification = {
  at: string;
  type: string;
  tripIndex: number;
  location?: string;
  eventValue?: string;
  /** Authoritative Traccar /reports/events type (US). */
  traccarType?: string;
  attributes?: Record<string, unknown>;
};

type TachoPoint = {
  atMs: number;
  speedKph: number;
  rpmRevPerSec: number;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const toImei = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length < 14 || digits.length > 17) return "";
  return digits;
};

const extractRpmRevPerSec = (source: Record<string, unknown> | null | undefined): number | null => {
  if (!source) return null;
  const io = source.io && typeof source.io === "object" ? (source.io as Record<string, unknown>) : undefined;
  const candidates = [
    source.rpm,
    source.RPM,
    source.engineRpm,
    source.engineRPM,
    source.engineSpeed,
    source.revolutions,
    source.rev,
    io?.rpm,
    io?.RPM,
    io?.engineRpm,
    io?.engineRPM,
    io?.revolutions,
  ];
  for (const candidate of candidates) {
    const parsed = toRpmRevPerSec(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
};

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const n =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(n));
};

const formatDurationFromMs = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const INVALID_DRIVER_VALUES = new Set(["", "-", "--", "—", "_", "n/a", "na", "none", "null", "undefined", "unknown", "no driver"]);

const meaningfulDriverText = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text || INVALID_DRIVER_VALUES.has(text.toLowerCase())) return "";
  return text;
};

const driverFromRecord = (source: unknown): string => {
  if (!source || typeof source !== "object") return "";
  const row = source as Record<string, unknown>;
  const attrs = row.attributes && typeof row.attributes === "object" ? (row.attributes as Record<string, unknown>) : {};
  const nested = row.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {};
  const nestedAttrs = nested.attributes && typeof nested.attributes === "object" ? (nested.attributes as Record<string, unknown>) : {};
  return (
    meaningfulDriverText(row.driverName)
    || meaningfulDriverText(row.driver)
    || meaningfulDriverText(row.driverIdentified)
    || meaningfulDriverText(row.defaultDriver)
    || meaningfulDriverText(attrs.driverName)
    || meaningfulDriverText(attrs.driver)
    || meaningfulDriverText(attrs.driverUniqueId)
    || meaningfulDriverText(row.driverUniqueId)
    || meaningfulDriverText(nested.driverName)
    || meaningfulDriverText(nested.driver)
    || meaningfulDriverText(nested.driverUniqueId)
    || meaningfulDriverText(nestedAttrs.driverName)
    || meaningfulDriverText(nestedAttrs.driver)
    || meaningfulDriverText(nestedAttrs.driverUniqueId)
  );
};

const normalizeDriverName = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!INVALID_DRIVER_VALUES.has(text.toLowerCase())) return text;
  }
  return "No Driver";
};

const tripHasDriver = (driver: unknown) => normalizeDriverName(driver) !== "No Driver";

const normalizeTripDistanceKm = (rawDistance: number, startMs: number, endMs: number): number => {
  if (!Number.isFinite(rawDistance) || rawDistance <= 0) return 0;
  if (rawDistance >= 1000) return rawDistance / 1000;
  if (!Number.isInteger(rawDistance)) return rawDistance;

  const durationHours = Math.max(0, endMs - startMs) / 3_600_000;
  if (durationHours <= 0) return rawDistance / 1000;

  const asKmAvg = rawDistance / durationHours;
  const asMetersAvg = (rawDistance / 1000) / durationHours;
  if (asKmAvg > 280 && asMetersAvg <= 280) return rawDistance / 1000;

  return rawDistance;
};

const normalizeNotificationLabel = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/[\-_]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/** US Traccar /reports/events type → library descriptions users bind / select. */
const TRACCAR_TYPE_LIBRARY_LABELS: Record<string, string[]> = {
  ignitionon: ["Ignition on", "Ignition On"],
  ignitionoff: ["Ignition off", "Ignition Off"],
  deviceoverspeed: [
    "Over speeding",
    "Speed limit exceeded",
    "Speed Limit Exceeded",
    "Road Speed Limit Exceeded",
    "Over Speeding Pre-Warning"
  ],
  overspeed: [
    "Over speeding",
    "Speed limit exceeded",
    "Speed Limit Exceeded",
    "Road Speed Limit Exceeded"
  ],
  geofenceenter: ["Geofence entered", "Geofence Entered"],
  geofenceexit: ["Geofence exited", "Geofence Exited"],
  deviceonline: ["Status online", "Status Online"],
  deviceoffline: ["Status offline", "Status Offline"],
  deviceunknown: ["Device Inactive", "Device inactive"],
  devicemoving: ["Device Moving", "Device moving"],
  devicestopped: ["Device Stopped", "Device stopped"],
  fueldrop: ["Fuel drop", "Fuel Siphoning", "Fuel siphoning (detected)"],
  fuelincrease: ["Fuel increase", "Fuel refill (detected)"],
  harshacceleration: ["Harsh acceleration", "Harsh Acceleration (excessive)"],
  harshbraking: ["Harsh braking", "Harsh Braking (excessive)"],
  harshcornering: ["Harsh Cornering", "Harsh cornering"],
  overrevving: ["Over revving", "Over revving - WARNING"],
  idling: ["Idle - excessive", "Excessive idle", "Idle"],
  greenband: ["Out of green band driving", "Extended Trip - Green Band"],
  alarm: ["Alarm"]
};

/** Traccar attributes.alarm subtypes → library rows. */
const TRACCAR_ALARM_LIBRARY_LABELS: Record<string, string[]> = {
  overspeed: TRACCAR_TYPE_LIBRARY_LABELS.deviceoverspeed,
  powercut: ["Power Disconnected", "Power cut", "External Power Cut", "Main Power Supply Disconnected"],
  powerrestored: ["Power Reconnected", "Power restored", "Main Power Supply Connected"],
  sos: ["SOS", "Panic", "Emergency"],
  vibration: ["Vibration", "Shock"],
  movement: ["Device Moving", "Movement"],
  lowbattery: ["Low Battery", "Battery Low"],
  tampering: ["Tamper", "Tampering"]
};

const findNotificationIndexByDescription = (catalog: NotificationRow[], target: string) => {
  const normalized = normalizeNotificationLabel(target);
  if (!normalized) return -1;
  return catalog.findIndex((row) => normalizeNotificationLabel(String(row.description ?? "")) === normalized);
};

const resolveNotificationIdByLabel = (catalog: NotificationRow[], label: string): string | null => {
  const raw = String(label ?? "").trim();
  const normalized = normalizeNotificationLabel(raw);
  if (!normalized) return null;

  if (normalized.includes("ignition")) {
    if (/\boff\b/.test(normalized)) {
      const offIndex = findNotificationIndexByDescription(catalog, "ignition off");
      return offIndex >= 0 ? String(offIndex + 1) : null;
    }
    if (/\bon\b/.test(normalized)) {
      const onIndex = findNotificationIndexByDescription(catalog, "ignition on");
      return onIndex >= 0 ? String(onIndex + 1) : null;
    }
    // Bare "Ignition" is state, not a Traccar on/off event — do not guess.
    return null;
  }

  const tryLabels = [
    raw,
    toCanonicalNotificationDescription(raw),
    ...(TRACCAR_TYPE_LIBRARY_LABELS[normalized.replace(/\s/g, "")] ?? []),
    ...(TRACCAR_ALARM_LIBRARY_LABELS[normalized.replace(/\s/g, "")] ?? [])
  ];

  for (const candidate of tryLabels) {
    const index = findNotificationIndexByDescription(catalog, candidate);
    if (index >= 0) return String(index + 1);
  }

  // Timeline lane synonyms (Over speeding ↔ Speed limit exceeded, etc.)
  for (const row of TIMELINE_ROW_ORDER) {
    const labels = row.libraryLabels.map((item) => normalizeNotificationLabel(item));
    if (!labels.some((item) => item === normalized || item.replace(/\s/g, "") === normalized.replace(/\s/g, ""))) {
      continue;
    }
    for (const libraryLabel of row.libraryLabels) {
      const index = findNotificationIndexByDescription(catalog, libraryLabel);
      if (index >= 0) return String(index + 1);
    }
  }

  // Bound stream-style exact alias match (no broad substring wildcards).
  for (let index = 0; index < catalog.length; index += 1) {
    const description = String(catalog[index]?.description ?? "").trim();
    if (!description) continue;
    if (
      eventMatchesAllowedLabels(
        { event: traccarEventToLabel(raw), traccarType: raw },
        [description]
      )
    ) {
      return String(index + 1);
    }
  }

  // Location / custom rows: geofence or alert name appears in the bound description.
  if (normalized.length >= 3) {
    const index = catalog.findIndex((row) => {
      const description = normalizeNotificationLabel(String(row.description ?? ""));
      if (!description || description.length < 3) return false;
      return description.includes(normalized) || normalized.includes(description);
    });
    if (index >= 0) return String(index + 1);
  }

  return null;
};

const parseViviConfigDescription = (attrs: Record<string, unknown>): string => {
  const raw = attrs.viviConfig;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as { description?: unknown };
      return String(parsed?.description ?? "").trim();
    } catch {
      return "";
    }
  }
  if (raw && typeof raw === "object") {
    return String((raw as { description?: unknown }).description ?? "").trim();
  }
  return String(attrs.viviDescription ?? attrs.description ?? "").trim();
};

const collectTraccarCandidateLabels = (
  traccarType: string,
  attrs: Record<string, unknown>
): string[] => {
  const type = String(traccarType ?? "").trim();
  const compact = normalizeNotificationLabel(type).replace(/\s/g, "");
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.push(text);
  };

  // Prefer binding description when Traccar stamped viviConfig (custom / location alerts).
  push(parseViviConfigDescription(attrs));
  push(attrs.geofenceName);
  push(attrs.geofence);

  // US Traccar: event.type is authoritative (except alarm subtypes).
  if (type && type !== "alarm") {
    push(type);
    push(traccarEventToLabel(type));
    for (const label of TRACCAR_TYPE_LIBRARY_LABELS[compact] ?? []) push(label);
  }

  const alarm = String(attrs.alarm ?? "").trim();
  if (type === "alarm" || alarm) {
    if (alarm) {
      push(alarm);
      push(traccarEventToLabel(alarm));
      const alarmKey = normalizeNotificationLabel(alarm).replace(/\s/g, "");
      for (const label of TRACCAR_ALARM_LIBRARY_LABELS[alarmKey] ?? TRACCAR_TYPE_LIBRARY_LABELS[alarmKey] ?? []) {
        push(label);
      }
    }
    if (type === "alarm") push("Alarm");
  }

  push(attrs.eventName);
  push(attrs.event);

  const seen = new Set<string>();
  return out.filter((label) => {
    const key = normalizeNotificationLabel(label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveLocationNotificationId = (
  catalog: NotificationRow[],
  geofenceName: string,
  traccarTypeCompact: string
): string | null => {
  const place = normalizeNotificationLabel(geofenceName);
  if (!place) return null;
  const wantsEnter = traccarTypeCompact === "geofenceenter";
  const wantsExit = traccarTypeCompact === "geofenceexit";
  const index = catalog.findIndex((row) => {
    const description = normalizeNotificationLabel(String(row.description ?? ""));
    if (!description) return false;
    if (!(description.includes(place) || place.includes(description) || description.split(/\s+/).some((part) => part.length >= 4 && place.includes(part)))) {
      return false;
    }
    if (wantsEnter && !/(enter|entry|inside|arrival)/.test(description) && !/location/.test(description)) {
      return false;
    }
    if (wantsExit && !/(exit|left|outside|depart)/.test(description) && !/location/.test(description)) {
      return false;
    }
    return true;
  });
  return index >= 0 ? String(index + 1) : null;
};

const resolveTraccarNotificationEvent = (
  catalog: NotificationRow[],
  eventType: string,
  attrs: Record<string, unknown> = {},
  traccarType?: string
): { id: string; ignitionState?: "on" | "off" } | null => {
  const type = String(traccarType || eventType || "").trim();
  const compact = normalizeNotificationLabel(type).replace(/\s/g, "");

  // Only real Traccar ignitionOn / ignitionOff — never invent from ignition state bits.
  let ignitionState: "on" | "off" | undefined;
  if (compact === "ignitionon" || type === "ignitionOn") ignitionState = "on";
  if (compact === "ignitionoff" || type === "ignitionOff") ignitionState = "off";

  for (const label of collectTraccarCandidateLabels(type, attrs)) {
    const id = resolveNotificationIdByLabel(catalog, label);
    if (id) return { id, ...(ignitionState ? { ignitionState } : {}) };
  }

  const geofenceName = String(attrs.geofenceName ?? attrs.geofence ?? "").trim();
  if (geofenceName && (compact === "geofenceenter" || compact === "geofenceexit")) {
    const id = resolveLocationNotificationId(catalog, geofenceName, compact);
    if (id) return { id };
  }

  if (ignitionState) {
    const id = resolveNotificationIdByLabel(
      catalog,
      ignitionState === "on" ? "Ignition on" : "Ignition off"
    );
    if (id) return { id, ignitionState };
  }

  return null;
};

const dedupeIgnitionNotificationEvents = (events: NotificationEvent[]): NotificationEvent[] => {
  const ignitionByMs = new Map<number, NotificationEvent>();
  const others: NotificationEvent[] = [];
  for (const event of events) {
    if (!event.ignitionState) {
      others.push(event);
      continue;
    }
    const atMs = Date.parse(event.at);
    if (!Number.isFinite(atMs)) continue;
    const existing = ignitionByMs.get(atMs);
    if (!existing) {
      ignitionByMs.set(atMs, event);
      continue;
    }
    if (existing.ignitionState === event.ignitionState) continue;
  }
  return [...others, ...Array.from(ignitionByMs.values())];
};

const finalizeNotificationEvents = (events: NotificationEvent[]) =>
  dedupeIgnitionNotificationEvents(events).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

/** Discrete event labels only — never boolean ignition/power state from telemetry samples. */
const extractDiscreteEventLabels = (data: Record<string, unknown> | null | undefined): string[] => {
  if (!data || typeof data !== "object") return [];
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.push(text);
  };
  if (Array.isArray(data.notifications)) data.notifications.forEach(push);
  if (Array.isArray(data.alerts)) data.alerts.forEach(push);
  push(data.event);
  push(data.eventName);
  push(data.eventType);
  const nested = data.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  if (nested) {
    if (Array.isArray(nested.notifications)) nested.notifications.forEach(push);
    if (Array.isArray(nested.alerts)) nested.alerts.forEach(push);
    push(nested.event);
    push(nested.eventName);
    push(nested.eventType);
  }
  const seen = new Set<string>();
  return out.filter((label) => {
    const key = normalizeNotificationLabel(label);
    if (!key || seen.has(key)) return false;
    // Drop bare ignition state labels — only ignitionOn/Off events count.
    if (key === "ignition") return false;
    seen.add(key);
    return true;
  });
};

const resolveRawTimelineNotifications = (
  rawEvents: RawTimelineNotification[],
  catalog: NotificationRow[]
): NotificationEvent[] => {
  const derived: NotificationEvent[] = [];
  for (const event of rawEvents) {
    const resolved = resolveTraccarNotificationEvent(
      catalog,
      event.type,
      event.attributes ?? {},
      event.traccarType || event.type
    );
    if (!resolved) continue;
    derived.push({
      id: resolved.id,
      at: event.at,
      durationMinutes: 1,
      tripIndex: event.tripIndex,
      location: event.location,
      eventValue: event.eventValue,
      ...(resolved.ignitionState ? { ignitionState: resolved.ignitionState } : {})
    });
  }
  return finalizeNotificationEvents(derived);
};

const mapTraccarEventsToRawNotifications = (
  eventReport: TraccarEvent[],
  derivedTrips: TimelineTrip[],
  windowStartMs: number,
  windowEndMs: number
): RawTimelineNotification[] => {
  const rawNotifications: RawTimelineNotification[] = [];
  for (const event of eventReport) {
    const at = String(event.eventTime ?? "");
    const atMs = Date.parse(at);
    if (!Number.isFinite(atMs)) continue;
    if (atMs < windowStartMs || atMs > windowEndMs) continue;
    const tripIndex = derivedTrips.findIndex((trip) => {
      const startMs = Date.parse(trip.start);
      const endMs = Date.parse(trip.end);
      return Number.isFinite(startMs) && Number.isFinite(endMs) && atMs >= startMs && atMs <= endMs;
    });
    const eventAttrs = (event.attributes && typeof event.attributes === "object")
      ? event.attributes
      : {};
    // US Traccar: event.type is the source of truth (ignitionOn, deviceOverspeed, …).
    const traccarType = String(event.type ?? "").trim() || "event";
    const eventValue = String(
      eventAttrs.value
        ?? eventAttrs.eventValue
        ?? eventAttrs.speed
        ?? eventAttrs.roadSpeed
        ?? eventAttrs.additionalEventInfo
        ?? "0"
    );
    rawNotifications.push({
      at,
      type: traccarType === "alarm"
        ? String(eventAttrs.alarm ?? eventAttrs.eventName ?? "alarm").trim() || "alarm"
        : traccarType,
      traccarType,
      attributes: eventAttrs,
      tripIndex: tripIndex >= 0 ? tripIndex : -1,
      location: String(
        (event as { address?: string }).address
          ?? eventAttrs.address
          ?? eventAttrs.location
          ?? eventAttrs.geofenceName
          ?? eventAttrs.geofence
          ?? ""
      ).trim(),
      eventValue
    });
  }
  return rawNotifications;
};

const eventLeftPercentInWindow = (atIso: string, windowStart: number, windowEnd: number): number | null => {
  const atMs = Date.parse(atIso);
  if (!Number.isFinite(atMs) || atMs < windowStart || atMs > windowEnd) return null;
  const durationMs = windowEnd - windowStart;
  if (durationMs <= 0) return null;
  return ((atMs - windowStart) / durationMs) * 100;
};

const CONTINUOUS_EVENT_MERGE_GAP_MS = 2 * 60 * 1000;
const MIN_CONTINUOUS_SPAN_MS = 60 * 1000;

const eventDurationMs = (event: NotificationEvent): number =>
  Math.max(MIN_CONTINUOUS_SPAN_MS, Math.round((event.durationMinutes ?? 1) * 60 * 1000));

type TimelineEventSpan = {
  startMs: number;
  endMs: number;
  event: NotificationEvent;
  leftPct: number;
  widthPct: number;
};

const buildContinuousSpans = (
  events: NotificationEvent[],
  windowStart: number,
  windowEnd: number,
  mergeGapMs = CONTINUOUS_EVENT_MERGE_GAP_MS
): TimelineEventSpan[] => {
  if (!events.length) return [];
  const duration = windowEnd - windowStart;
  if (duration <= 0) return [];

  const sorted = [...events]
    .filter((event) => {
      const at = Date.parse(event.at);
      return Number.isFinite(at) && at <= windowEnd;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!sorted.length) return [];

  const rawSpans: Array<{ startMs: number; endMs: number; event: NotificationEvent }> = [];
  let spanStart = Date.parse(sorted[0].at);
  let spanEnd = spanStart + eventDurationMs(sorted[0]);
  let representative = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const at = Date.parse(sorted[i].at);
    const end = at + eventDurationMs(sorted[i]);
    if (at - spanEnd <= mergeGapMs) {
      spanEnd = Math.max(spanEnd, end);
    } else {
      rawSpans.push({ startMs: spanStart, endMs: spanEnd, event: representative });
      spanStart = at;
      spanEnd = end;
      representative = sorted[i];
    }
  }
  rawSpans.push({ startMs: spanStart, endMs: spanEnd, event: representative });

  return rawSpans
    .map((span) => {
      const clampedStart = Math.max(span.startMs, windowStart);
      const clampedEnd = Math.min(span.endMs, windowEnd);
      if (clampedEnd <= clampedStart) return null;
      return {
        ...span,
        startMs: clampedStart,
        endMs: clampedEnd,
        leftPct: ((clampedStart - windowStart) / duration) * 100,
        widthPct: ((clampedEnd - clampedStart) / duration) * 100
      };
    })
    .filter((span): span is TimelineEventSpan => span !== null && span.widthPct > 0.02);
};

const formatEventDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (val: number) => String(val).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDurationHms = (durationMs: number) => {
  const totalSec = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (val: number) => String(val).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};
import "../index.css";
import type { NotificationRow } from "../data/notificationLibrary";
import {
  boundOptionsToNotificationRows,
  loadBoundNotificationOptionsForSite,
  NOTIFICATION_LIBRARY_UPDATED_EVENT,
  readActiveSiteName
} from "../utils/notificationLibraryStore";
import {
  buildNotificationIdToRowKey,
  buildVisibleTimelineRows,
  rangeToMilliseconds,
  timelineWindowFromAnchor,
  type TimelineRowDefinition,
  type TimelineRowKey
} from "../utils/tripTimelineRows";
import {
  clearUserPref,
  readUserPref,
  readUserPrefJson,
  USER_PREF_KEYS,
  writeActiveAssetPrefs,
  writeUserPref,
  writeUserPrefJson
} from "../utils/userAppPrefs";
import {
  PrintIcon,
  QueryIcon,
  TachoIcon,
  FuelTachoIcon,
  PinsIcon,
  SettingsIcon,
  DownloadIcon,
  ReportIcon,
  VideoIcon,
  AdvancedPlusIcon
} from "../components/Icons";

const ranges = ["30d", "7d", "24h", "12h", "6h", "3h", "1h", "30m", "15m", "10m", "5m"];
const toolIcons = [
  { label: "Print", icon: <PrintIcon /> },
  { label: "Query line", icon: <QueryIcon /> },
  { label: "Tacho data", icon: <TachoIcon /> },
  { label: "Fuel Tacho", icon: <FuelTachoIcon /> },
  { label: "Pins", icon: <PinsIcon /> }
];

const moreMenuOptions = [
  { label: "Timeline settings", icon: <SettingsIcon /> },
  { label: "Download GPS data", icon: <DownloadIcon /> },
  { label: "Download Tacho Graph", icon: <DownloadIcon /> },
  { label: "Timeline report", icon: <ReportIcon /> },
  { label: "Download video", icon: <VideoIcon /> },
  { label: "Advanced", icon: <AdvancedPlusIcon /> }
];

type ContextOptionObj = { name: string; site?: string };

const isContextOptionObj = (item: unknown): item is ContextOptionObj => {
  if (!item || typeof item !== "object") return false;
  return typeof (item as any).name === "string";
};

const normalizeContextOptions = (stored: string | null) => {
  if (!stored) return [];
  const selection = readStoredSelectionScope();
  try {
    const parsed = JSON.parse(stored) as Array<string | { name?: string; site?: string }>;
    if (!Array.isArray(parsed)) return [];
    if (parsed.length > 0 && typeof parsed[0] === "object") {
      return parsed
        .filter(isContextOptionObj)
        .filter((item) => matchesStoredSiteSelection(item.site ?? "", selection))
        .map((item) => item.name);
    }
    return parsed.filter((item) => typeof item === "string" && item) as string[];
  } catch {
    return [];
  }
};

const DEFAULT_VIDEO_REQUEST_DURATION_MS = 2 * 60 * 1000;

const toLocalDateTimeInputValue = (value: Date) => {
  const date = new Date(value);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const buildDefaultVideoWindow = (anchorValue: string) => {
  const anchor = new Date(anchorValue);
  const from = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const to = new Date(from.getTime() + DEFAULT_VIDEO_REQUEST_DURATION_MS);
  return {
    from: toLocalDateTimeInputValue(from),
    to: toLocalDateTimeInputValue(to)
  };
};

export default function TripTimeline() {
  const now = new Date();
  // Timeline window starts at local midnight by default so today's trips are visible
  // (a "now → +24h" window hid all earlier activity for the day).
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayStartIso = toLocalDateTimeInputValue(startOfToday);
  const nowIso = toLocalDateTimeInputValue(now);
  const nowTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  const tenantStorageSuffix = useMemo(() => {
    const tenantId = String(getTenantId() ?? "").trim();
    return tenantId ? `:${tenantId}` : "";
  }, []);
  const scopedStorageKey = (base: string) => `${base}${tenantStorageSuffix}`;
  const readScopedStorage = (base: string) => localStorage.getItem(scopedStorageKey(base)) || localStorage.getItem(base);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState(dayStartIso);
  // For react-datepicker, keep a Date object in sync
  const [selectedDateObj, setSelectedDateObj] = useState(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day;
  });
  const [selectedTime, setSelectedTime] = useState("00:00");
  const [selectedAsset, setSelectedAsset] = useState(() => readUserPref(USER_PREF_KEYS.activeAsset) || "");
  const [contextType, setContextType] = useState(() => readUserPref(USER_PREF_KEYS.contextType) || "");
  const [contextName, setContextName] = useState(() => readUserPref(USER_PREF_KEYS.contextName) || "");
  const [viewMode, setViewMode] = useState<"drivers" | "passengers" | "assets">(() => {
    const stored = readUserPref(USER_PREF_KEYS.contextType) || "";
    if (stored === "passenger") return "passengers";
    return stored === "driver" ? "drivers" : "assets";
  });
  const [contextOptions, setContextOptions] = useState<string[]>(() => {
    const storedType = readUserPref(USER_PREF_KEYS.contextType) || "";
    const key = storedType === "passenger"
      ? "vivi.contextOptions.passenger"
      : storedType === "driver"
        ? "vivi.contextOptions.driver"
        : "vivi.contextOptions";
    return normalizeContextOptions(readScopedStorage(key));
  });
  const isPersonTimeline = contextType === "driver" || contextType === "passenger";
  const displayName = isPersonTimeline ? contextName || selectedAsset : selectedAsset;
  const hasSelection = Boolean(displayName);
  const [showQueryLine, setShowQueryLine] = useState(true);
  const [queryLinePct, setQueryLinePct] = useState(62);
  const [draggingQueryLine, setDraggingQueryLine] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>(() => {
    const saved = readUserPrefJson<string[]>(USER_PREF_KEYS.tripTimelineSelectedNotifications);
    return Array.isArray(saved) ? saved.map((id) => String(id)).filter(Boolean) : [];
  });
  const [notificationFilter, setNotificationFilter] = useState("");
  const [isDatepickerOpen, setIsDatepickerOpen] = useState(false);
  const [showSelectorModal, setShowSelectorModal] = useState(false);
  const [activePicker, setActivePicker] = useState<"date" | "time">("date");
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoFrom, setVideoFrom] = useState(nowIso);
  const [videoTo, setVideoTo] = useState(nowIso);
  const [videoViews, setVideoViews] = useState<string[]>([]);
  const [videoResolution, setVideoResolution] = useState("HD (1080p)");
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [videoPickerTarget, setVideoPickerTarget] = useState<"from" | "to">("from");
  const [videoPickerDateObj, setVideoPickerDateObj] = useState(() => new Date());
  const [videoPickerTime, setVideoPickerTime] = useState(nowTime);
  const [videoPickerActive, setVideoPickerActive] = useState<"date" | "time">("date");
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState(() => readScopedStorage("vivi.activeSite") || "");
  const [selectedRegistration, setSelectedRegistration] = useState(() => {
    const stored = readUserPref(USER_PREF_KEYS.activeRegistration);
    if (stored) return stored;
    const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset) || selectedAsset;
    if (!assetLabel) return "";
    return assetLabel.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel;
  });
  const [selectedImei, setSelectedImei] = useState(() => {
    const stored = readUserPref(USER_PREF_KEYS.activeImei);
    if (stored) return stored;
    const storedReg = readUserPref(USER_PREF_KEYS.activeRegistration);
    return toImei(storedReg);
  });
  const [assetSelectorOptions, setAssetSelectorOptions] = useState<Array<{ label: string; registration: string; imei: string }>>([]);
  const assetDriverByKeyRef = useRef<Map<string, string>>(new Map());
  const [notificationCatalog, setNotificationCatalog] = useState<NotificationRow[]>([]);
  const notificationCatalogRef = useRef<NotificationRow[]>([]);
  const [trips, setTrips] = useState<TimelineTrip[]>([]);
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [rawTimelineNotifications, setRawTimelineNotifications] = useState<RawTimelineNotification[]>([]);
  const [tachoPoints, setTachoPoints] = useState<TachoPoint[]>([]);
  const [fuelTrendPoints, setFuelTrendPoints] = useState<FuelTrendPoint[]>([]);
  const [fuelChangePoints, setFuelChangePoints] = useState<FuelChangePoint[]>([]);
  const [fuelHoverIndex, setFuelHoverIndex] = useState<number | null>(null);
  const [tachoHoverIndex, setTachoHoverIndex] = useState<number | null>(null);
  const [showTachoModal, setShowTachoModal] = useState(false);
  const [showFuelTachoModal, setShowFuelTachoModal] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const tachoChartSvgRef = useRef<SVGSVGElement | null>(null);
  const fuelChartSvgRef = useRef<SVGSVGElement | null>(null);
  const downloadNoticeTimeout = useRef<number | null>(null);
  // Timeline navigation state
  const [timelineOffsetHours, setTimelineOffsetHours] = useState(0); // in hours
  const [timelineRange, setTimelineRange] = useState("24h");
  const timelineWindowMs = useMemo(() => rangeToMilliseconds(timelineRange), [timelineRange]);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const tripsRef = useRef<TimelineTrip[]>([]);
  tripsRef.current = trips;
  const timelineLoadIdentityRef = useRef("");
  const visibleToolIcons = isPersonTimeline
    ? toolIcons.filter((tool) =>
        tool.label === "Print"
        || tool.label === "Query line"
        || tool.label === "Tacho data"
        || tool.label === "Fuel Tacho"
      )
    : toolIcons;
  const visibleMoreMenuOptions = isPersonTimeline
    ? moreMenuOptions.filter((opt) => opt.label === "Timeline settings" || opt.label === "Timeline report")
    : moreMenuOptions;

  const handleViewModeChange = (mode: "drivers" | "passengers" | "assets") => {
    setViewMode(mode);
    if (mode === "drivers") {
      writeUserPref(USER_PREF_KEYS.contextType, "driver");
      if (!contextName && contextOptions.length > 0) {
        writeUserPref(USER_PREF_KEYS.contextName, contextOptions[0]);
      }
    } else if (mode === "passengers") {
      writeUserPref(USER_PREF_KEYS.contextType, "passenger");
      if (!contextName && contextOptions.length > 0) {
        writeUserPref(USER_PREF_KEYS.contextName, contextOptions[0]);
      }
    } else {
      writeUserPref(USER_PREF_KEYS.contextType, "asset");
    }
    window.dispatchEvent(new Event("vivi:contextchange"));
  };

  const baseStart = useMemo(() => {
    const base = new Date(selectedDateTime);
    if (Number.isNaN(base.getTime())) return null;
    return new Date(timelineWindowFromAnchor(base, timelineRange, timelineOffsetHours).startMs);
  }, [selectedDateTime, timelineOffsetHours, timelineRange]);

  const latestTripEnd = useMemo(() => {
    if (trips.length === 0) return null;
    const latest = trips.reduce((max, trip) => {
      const end = new Date(trip.end).getTime();
      return Number.isNaN(end) ? max : Math.max(max, end);
    }, 0);
    return latest ? new Date(latest) : null;
  }, [trips]);

  const formatChartTime = (atMs: number) => new Date(atMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const tachoChartGeometry = useMemo(() => {
    const width = 900;
    const height = 360;
    const left = 70;
    const right = 70;
    const top = 20;
    const bottom = 52;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const defaultTo = Date.now();
    const defaultFrom = defaultTo - 24 * 60 * 60 * 1000;
    const fromMs = baseStart ? baseStart.getTime() : defaultFrom;
    const toMs = baseStart ? fromMs + 24 * 60 * 60 * 1000 : defaultTo;

    const windowPoints = tachoPoints
      .filter((point) => point.atMs >= fromMs && point.atMs <= toMs)
      .sort((a, b) => a.atMs - b.atMs);

    const peakSpeed = windowPoints.reduce((max, point) => Math.max(max, point.speedKph), 0);
    const peakRpm = windowPoints.reduce((max, point) => Math.max(max, point.rpmRevPerSec), 0);
    // Multiple of 5 (min 10) so the five axis steps are whole km/h.
    const maxSpeed = Math.max(10, Math.ceil(tachoAxisMax(peakSpeed, 140) / 5) * 5);
    const maxRpm = tachoAxisMax(peakRpm, 50);

    const xForMs = (atMs: number) => {
      const ratio = (atMs - fromMs) / Math.max(1, toMs - fromMs);
      return left + Math.max(0, Math.min(1, ratio)) * innerWidth;
    };
    const yForSpeed = (speedKph: number) => {
      const ratio = speedKph / Math.max(1, maxSpeed);
      return top + innerHeight - Math.max(0, Math.min(1, ratio)) * innerHeight;
    };
    const yForRpm = (rpmRevPerSec: number) => {
      const ratio = rpmRevPerSec / Math.max(1, maxRpm);
      return top + innerHeight - Math.max(0, Math.min(1, ratio)) * innerHeight;
    };

    const pathPoints = thinTachoPathPoints(windowPoints);
    const speedPath = pathPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${xForMs(point.atMs)} ${yForSpeed(point.speedKph)}`)
      .join(" ");
    const rpmPath = pathPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${xForMs(point.atMs)} ${yForRpm(point.rpmRevPerSec)}`)
      .join(" ");

    const yTicks = Array.from({ length: 6 }, (_, idx) => {
      const t = idx / 5;
      const y = top + innerHeight - innerHeight * t;
      return {
        y,
        speedKph: maxSpeed * t,
        rpmRevPerSec: maxRpm * t,
      };
    });

    const xTicks = Array.from({ length: 9 }, (_, idx) => {
      const atMs = fromMs + (idx / 8) * (toMs - fromMs);
      return { atMs, x: xForMs(atMs) };
    });

    const pointDots = windowPoints.map((point, index) => ({
      index,
      x: xForMs(point.atMs),
      speedY: yForSpeed(point.speedKph),
      rpmY: yForRpm(point.rpmRevPerSec),
      atMs: point.atMs,
      speedKph: point.speedKph,
      rpmRevPerSec: point.rpmRevPerSec
    }));

    return {
      width,
      height,
      left,
      right,
      top,
      innerWidth,
      innerHeight,
      fromMs,
      toMs,
      points: windowPoints,
      pointDots,
      speedPath,
      rpmPath,
      xTicks,
      yTicks,
    };
  }, [baseStart, tachoPoints]);

  const fuelChartGeometry = useMemo(() => {
    const width = 900;
    const height = 360;
    const left = 70;
    const right = 20;
    const top = 20;
    const bottom = 64;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const defaultTo = Date.now();
    const defaultFrom = defaultTo - 24 * 60 * 60 * 1000;
    const fromMs = baseStart ? baseStart.getTime() : defaultFrom;
    const toMs = baseStart ? fromMs + 24 * 60 * 60 * 1000 : defaultTo;

    const windowPoints = fuelTrendPoints
      .filter((point) => point.atMs >= fromMs && point.atMs <= toMs)
      .sort((a, b) => a.atMs - b.atMs);

    let minFuel = 0;
    let maxFuel = 100;
    if (windowPoints.length > 0) {
      const bounds = fuelAxisBounds(windowPoints.map((point) => point.liters));
      minFuel = bounds.min;
      maxFuel = bounds.max;
    }

    const xForMs = (atMs: number) => {
      const ratio = (atMs - fromMs) / Math.max(1, toMs - fromMs);
      return left + Math.max(0, Math.min(1, ratio)) * innerWidth;
    };
    const yForFuel = (liters: number) => {
      const ratio = (liters - minFuel) / Math.max(1e-9, maxFuel - minFuel);
      return top + innerHeight - Math.max(0, Math.min(1, ratio)) * innerHeight;
    };

    const linePath = windowPoints
      .map((point, index) => `${index === 0 ? "M" : "L"}${xForMs(point.atMs)} ${yForFuel(point.liters)}`)
      .join(" ");

    const bottomY = top + innerHeight;
    const areaPath =
      windowPoints.length > 1
        ? `${linePath} L${xForMs(windowPoints[windowPoints.length - 1].atMs)} ${bottomY} L${xForMs(windowPoints[0].atMs)} ${bottomY} Z`
        : "";

    const yTicks = Array.from({ length: 6 }, (_, idx) => {
      const t = idx / 5;
      const liters = minFuel + (maxFuel - minFuel) * t;
      const y = top + innerHeight - innerHeight * t;
      return { liters, y };
    });

    const xTicks = Array.from({ length: 9 }, (_, idx) => {
      const atMs = fromMs + (idx / 8) * (toMs - fromMs);
      return { atMs, x: xForMs(atMs) };
    });

    const windowChangePoints = fuelChangePoints.filter((point) => point.atMs >= fromMs && point.atMs <= toMs);
    const changeDots = windowChangePoints.map((point) => ({
      x: xForMs(point.atMs),
      yFrom: yForFuel(point.fromLevel),
      yTo: yForFuel(point.toLevel),
      rising: point.rising,
      deltaLiters: point.deltaLiters,
      fromLevel: point.fromLevel,
      toLevel: point.toLevel,
      atMs: point.atMs
    }));

    const pointDots = windowPoints.map((point, index) => ({
      index,
      x: xForMs(point.atMs),
      y: yForFuel(point.liters),
      atMs: point.atMs,
      liters: point.liters
    }));

    return {
      width,
      height,
      left,
      top,
      innerWidth,
      innerHeight,
      fromMs,
      toMs,
      minFuel,
      maxFuel,
      yTicks,
      xTicks,
      linePath,
      areaPath,
      changeDots,
      pointDots,
      points: windowPoints
    };
  }, [baseStart, fuelTrendPoints, fuelChangePoints]);

  const fuelSummary = useMemo(() => {
    if (fuelChartGeometry.points.length === 0) return null;
    const startLiters = fuelChartGeometry.points[0].liters;
    const endLiters = fuelChartGeometry.points[fuelChartGeometry.points.length - 1].liters;
    const changeLiters = endLiters - startLiters;
    const refuelCount = fuelChartGeometry.changeDots.filter((event) => event.rising).length;
    const dropCount = fuelChartGeometry.changeDots.filter((event) => !event.rising).length;
    return { startLiters, endLiters, changeLiters, refuelCount, dropCount };
  }, [fuelChartGeometry]);

  const resetFuelTrend = () => {
    setFuelTrendPoints([]);
    setFuelChangePoints([]);
    setFuelHoverIndex(null);
  };

  const applyFuelTrend = (rawTrend: FuelTrendPoint[], routePoints?: Parameters<typeof filterFuelChangePointsForMotion>[1]) => {
    const stabilized = stabilizeFuelTrend(rawTrend);
    setFuelTrendPoints(stabilized.smoothed);
    setFuelChangePoints(
      routePoints && routePoints.length > 0
        ? filterFuelChangePointsForMotion(stabilized.events, routePoints)
        : stabilized.events
    );
    setFuelHoverIndex(null);
  };

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

  const updateTachoHoverFromClientX = (clientX: number) => {
    const svg = tachoChartSvgRef.current;
    if (!svg || tachoChartGeometry.pointDots.length === 0) {
      setTachoHoverIndex(null);
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) {
      setTachoHoverIndex(null);
      return;
    }

    const xInSvg = ((clientX - rect.left) / rect.width) * tachoChartGeometry.width;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tachoChartGeometry.pointDots.length; i += 1) {
      const distance = Math.abs(tachoChartGeometry.pointDots[i].x - xInSvg);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    setTachoHoverIndex(bestIndex);
  };

  const visibleTrips = useMemo(() => {
    if (!baseStart) return [];
    const windowStart = baseStart.getTime();
    const windowEnd = windowStart + timelineWindowMs;
    return trips.filter((trip) => {
      const tripStart = new Date(trip.start).getTime();
      const tripEnd = new Date(trip.end).getTime();
      return tripEnd > windowStart && tripStart < windowEnd;
    });
  }, [baseStart, trips, timelineWindowMs]);

  const formatDateTime = (dt: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(
      dt.getMinutes()
    )}:${pad(dt.getSeconds())}`;
  };

  const formatDisplayDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (val: number) => String(val).padStart(2, "0");
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
      date.getMinutes()
    )}`;
  };

  const fuelTachoWindowLabel = useMemo(() => {
    if (!baseStart) return "24-hour window";
    const windowEnd = new Date(baseStart.getTime() + timelineWindowMs);
    return `${formatDateTime(baseStart)} - ${formatDateTime(windowEnd)} EAT`;
  }, [baseStart, timelineWindowMs]);

  const shiftFuelTachoWindow = (hours: number) => {
    setFuelHoverIndex(null);
    setTimelineOffsetHours((offset) => offset + hours);
  };

  const formatTimeLabel = (dt: Date) => `${String(dt.getHours()).padStart(2, "0")}:00`;

  const scaleLabels = useMemo(() => {
    if (!baseStart) {
      return [
        { label: "21:00", pct: 0 },
        { label: "00:00", pct: 12.5 },
        { label: "03:00", pct: 25 },
        { label: "06:00", pct: 37.5 },
        { label: "09:00", pct: 50 },
        { label: "12:00", pct: 62.5 },
        { label: "15:00", pct: 75 },
        { label: "18:00", pct: 87.5 }
      ];
    }
    const stepMs = timelineWindowMs / 8;
    return Array.from({ length: 8 }, (_, index) => {
      const dt = new Date(baseStart.getTime() + index * stepMs);
      return { label: formatTimeLabel(dt), pct: (index / 8) * 100 };
    });
  }, [baseStart, timelineWindowMs]);

  const queryLabel = useMemo(() => {
    if (!baseStart) return "";
    const offsetMs = (queryLinePct / 100) * timelineWindowMs;
    const dt = new Date(baseStart.getTime() + offsetMs);
    return formatDateTime(dt);
  }, [baseStart, queryLinePct, timelineWindowMs]);

  const specialMarkerPcts = useMemo(() => {
    if (!baseStart) return [];
    const windowStart = baseStart.getTime();
    const windowEnd = windowStart + timelineWindowMs;
    const duration = windowEnd - windowStart;
    if (duration <= 0) return [];

    const results: { pct: number; label: string }[] = [];
    const cursor = new Date(windowStart);
    cursor.setMinutes(0, 0, 0);
    for (let ms = cursor.getTime(); ms <= windowEnd + 60 * 1000; ms += 60 * 60 * 1000) {
      if (ms < windowStart || ms > windowEnd) continue;
      const hour = new Date(ms).getHours();
      const label = hour === 0 ? "Midnight" : hour === 12 ? "Midday" : "";
      if (!label) continue;
      const pct = ((ms - windowStart) / duration) * 100;
      if (!results.some((entry) => Math.abs(entry.pct - pct) < 0.05)) {
        results.push({ pct, label });
      }
    }
    return results.sort((a, b) => a.pct - b.pct);
  }, [baseStart, timelineWindowMs]);

  const timelineWindow = useMemo(() => {
    if (!baseStart) return null;
    const windowStart = baseStart.getTime();
    return { windowStart, windowEnd: windowStart + timelineWindowMs };
  }, [baseStart, timelineWindowMs]);

  const renderTimelineRuler = (keyPrefix: string) =>
    Array.from({ length: 49 }, (_, i) => {
      const pct = (i / 48) * 100;
      const isHour = i % 2 === 0;
      const cls = isHour ? "trip-ruler-tick--hour" : "trip-ruler-tick--half";
      return <span key={`${keyPrefix}-${i}`} className={`trip-ruler-tick ${cls}`} style={{ left: `${pct}%` }} />;
    });

  const handleToolAction = (label: string) => {
    if (label === "Print") {
      window.print();
      return;
    }
    if (label === "Query line") {
      setShowQueryLine((current) => !current);
      return;
    }
    if (label === "More") {
      setShowMoreMenu((open) => !open);
      return;
    }
    if (label === "Tacho data") {
      setTachoHoverIndex(null);
      setShowTachoModal(true);
      return;
    }
    if (label === "Fuel Tacho") {
      setFuelHoverIndex(null);
      setShowFuelTachoModal(true);
      return;
    }
    console.info(`${label} clicked`);
  };

  const handleDownload = (filename: string, content: string, type = "text/plain") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const showDownloadNotice = (message: string) => {
    setDownloadNotice(message);
    if (downloadNoticeTimeout.current) {
      window.clearTimeout(downloadNoticeTimeout.current);
    }
    downloadNoticeTimeout.current = window.setTimeout(() => {
      setDownloadNotice(null);
      downloadNoticeTimeout.current = null;
    }, 4200);
  };

  useEffect(() => {
    return () => {
      if (downloadNoticeTimeout.current) {
        window.clearTimeout(downloadNoticeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateFromStorage = () => {
      const site = readScopedStorage("vivi.activeSite") || "";
      const reg = readUserPref(USER_PREF_KEYS.activeRegistration);
      const imei = readUserPref(USER_PREF_KEYS.activeImei);
      const assetLabel = readUserPref(USER_PREF_KEYS.activeAsset) || selectedAsset;
      const derivedReg = reg || (assetLabel?.includes(" - ") ? assetLabel.split(" - ").slice(-1)[0] : assetLabel);
      const storedContextType = readUserPref(USER_PREF_KEYS.contextType) || "";
      const storedContextName = readUserPref(USER_PREF_KEYS.contextName) || "";
      const optionsKey = storedContextType === "passenger"
        ? "vivi.contextOptions.passenger"
        : storedContextType === "driver"
          ? "vivi.contextOptions.driver"
          : "vivi.contextOptions";
      const storedContextOptions = readScopedStorage(optionsKey);
      setSelectedSite(site || "");
      setSelectedRegistration(derivedReg || "");
      setSelectedImei(imei || toImei(derivedReg || ""));
      setSelectedAsset(assetLabel || "");
      setContextType(storedContextType);
      setContextName(storedContextName);
      setViewMode(
        storedContextType === "passenger"
          ? "passengers"
          : storedContextType === "driver"
            ? "drivers"
            : "assets"
      );
      setContextOptions(normalizeContextOptions(storedContextOptions));
    };
    updateFromStorage();
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key?.includes("vivi.activeAsset")
        || event.key?.includes("vivi.activeRegistration")
        || event.key?.includes("vivi.activeImei")
        || event.key?.includes("vivi.contextType")
        || event.key?.includes("vivi.contextName")
        || event.key?.startsWith("vivi.activeSite")
        || event.key?.startsWith("vivi.contextOptions")
      ) {
        updateFromStorage();
      }
    };
    const handleContextChange = () => updateFromStorage();
    window.addEventListener("storage", handleStorage);
    window.addEventListener("vivi:contextchange", handleContextChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("vivi:contextchange", handleContextChange as EventListener);
    };
  }, [selectedAsset, tenantStorageSuffix]);

  // Historical Tracking / Assets handoff: apply trip window + asset then clear one-shot keys.
  useEffect(() => {
    const startRaw = readUserPref(USER_PREF_KEYS.tripTimelineStart);
    const assetRaw = readUserPref(USER_PREF_KEYS.tripTimelineAsset);
    if (startRaw) {
      const start = new Date(startRaw);
      if (!Number.isNaN(start.getTime())) {
        start.setMinutes(0, 0, 0);
        const timeValue = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
        setSelectedDateObj(start);
        setSelectedTime(timeValue);
        setSelectedDateTime(toLocalDateTimeInputValue(start));
      }
    }
    if (assetRaw) {
      const label = String(assetRaw).trim();
      if (label) {
        setSelectedAsset(label);
        const derivedReg = label.includes(" - ") ? label.split(" - ").slice(-1)[0] : label;
        setSelectedRegistration(derivedReg);
        const storedImei = readUserPref(USER_PREF_KEYS.activeImei);
        setSelectedImei(storedImei || toImei(derivedReg));
      }
    }
    clearUserPref(USER_PREF_KEYS.tripTimelineStart);
    clearUserPref(USER_PREF_KEYS.tripTimelineEnd);
    clearUserPref(USER_PREF_KEYS.tripTimelineAsset);
    // Mount-only handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadIdentity = `${selectedImei}|${selectedRegistration}|${selectedAsset}`;
    const assetChanged = timelineLoadIdentityRef.current !== loadIdentity;
    const hasLoadTarget = Boolean(String(displayName ?? "").trim());
    if (assetChanged) {
      timelineLoadIdentityRef.current = loadIdentity;
      setTrips([]);
      setNotificationEvents([]);
      setRawTimelineNotifications([]);
      setTachoPoints([]);
      resetFuelTrend();
      setTimelineLoading(true);
    }

    const loadTimeline = async () => {
      try {
        if (!hasLoadTarget) {
          setTrips([]);
          setNotificationEvents([]);
          setRawTimelineNotifications([]);
          setTachoPoints([]);
          resetFuelTrend();
          setTimelineError("");
          return;
        }
        if (!assetChanged && tripsRef.current.length === 0) {
          setTimelineLoading(true);
        }
        beginSaving("Loading");
        setTimelineError("");

        const imei = String(selectedImei ?? "").trim();
        const apiKey = getApiKey();
        const tenantId = getTenantId();

        if (!apiKey || !tenantId) {
          setTrips([]);
          setNotificationEvents([]);
          setRawTimelineNotifications([]);
          setTachoPoints([]);
          resetFuelTrend();
          setTimelineError("Missing API key or tenant.");
          endSavingError();
          return;
        }

        const anchor = new Date(selectedDateTime || toLocalDateTimeInputValue(new Date()));
        const window = timelineWindowFromAnchor(
          Number.isNaN(anchor.getTime()) ? new Date() : anchor,
          timelineRange,
          timelineOffsetHours
        );
        const windowStartMs = window.startMs;
        const windowEndMs = window.endMs;
        const padMs = 3 * 60 * 60 * 1000;
        const fromIso = new Date(windowStartMs - padMs).toISOString();
        const toIso = new Date(windowEndMs + padMs).toISOString();

        const registrationLabel =
          selectedRegistration
          || (selectedAsset.includes(" - ") ? selectedAsset.split(" - ").slice(-1)[0] : selectedAsset)
          || "N/A";

        let timelineAsset: Record<string, unknown> | null = null;
        const assignedDriverName = () => {
          const fromAsset = resolveAssetDriverName(timelineAsset);
          if (fromAsset) return fromAsset;
          const keys = [selectedImei, selectedRegistration, selectedAsset]
            .map((value) => String(value ?? "").trim().toLowerCase())
            .filter(Boolean);
          for (const key of keys) {
            const hit = assetDriverByKeyRef.current.get(key);
            if (hit) return hit;
          }
          return "";
        };
        const labelDriver = (...values: unknown[]) => {
          if (contextType === "driver") return normalizeDriverName(contextName);
          const explicit = values.map((value) => (
            value && typeof value === "object" ? driverFromRecord(value) : meaningfulDriverText(value)
          )).find(Boolean) || "";
          const detected = explicit || assignedDriverName();
          return normalizeDriverName(resolveTripDriverName(detected, timelineAsset, assignedDriverName()));
        };

        const dominantRouteDriver = (routeReport: Awaited<ReturnType<typeof getTraccarRoute>>, startMs: number, endMs: number) => {
          const counts = new Map<string, number>();
          for (const point of routeReport) {
            const atMs = Date.parse(String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? ""));
            if (!Number.isFinite(atMs) || atMs < startMs || atMs > endMs) continue;
            const name = driverFromRecord(point);
            if (!name) continue;
            counts.set(name, (counts.get(name) ?? 0) + 1);
          }
          let best = "";
          let bestCount = 0;
          for (const [name, count] of counts) {
            if (count > bestCount) {
              best = name;
              bestCount = count;
            }
          }
          return best;
        };

        const mapTraccarTrips = (tripReport: Awaited<ReturnType<typeof getTraccarTrips>>): TimelineTrip[] =>
          tripReport
            .map((trip) => {
              const start = String(trip.startTime ?? "");
              const end = String(trip.endTime ?? start);
              const startMs = Date.parse(start);
              const endMs = Date.parse(end);
              if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
              const rawDistance = Number(trip.distance ?? 0);
              const distanceKm = normalizeTripDistanceKm(rawDistance, startMs, endMs);
              return {
                driver: labelDriver(trip.driverName, trip.driverUniqueId, trip),
                registration: registrationLabel,
                start,
                end,
                duration: formatDurationFromMs(Math.max(0, endMs - startMs)),
                distance: `${Math.max(0, distanceKm).toFixed(2)} km`,
                maxSpeed: `${Number(trip.maxSpeed ?? 0).toFixed(0)} km/h`,
                fuelUsed: Number(trip.spentFuel ?? 0) > 0 ? `${Number(trip.spentFuel ?? 0).toFixed(2)} L` : "N/A",
                segments: [{ start, end, type: "moving" as const }]
              };
            })
            .filter(Boolean)
            .sort((a, b) => Date.parse(a!.start) - Date.parse(b!.start)) as TimelineTrip[];

        const enrichFromRouteAndEvents = (
          derivedTrips: TimelineTrip[],
          routeReport: Awaited<ReturnType<typeof getTraccarRoute>>,
          eventReport: Awaited<ReturnType<typeof getTraccarEvents>>
        ) => {
          // US Traccar /reports/events: map by event.type (not attributes.alarm first).
          const rawNotifications = mapTraccarEventsToRawNotifications(
            eventReport,
            derivedTrips,
            windowStartMs,
            windowEndMs
          );

          setRawTimelineNotifications(rawNotifications);
          setNotificationEvents(resolveRawTimelineNotifications(rawNotifications, notificationCatalogRef.current));

          if (contextType !== "driver" && routeReport.length > 0) {
            const withDrivers = derivedTrips.map((trip) => {
              const startMs = Date.parse(trip.start);
              const endMs = Date.parse(trip.end);
              const fromRoute = dominantRouteDriver(routeReport, startMs, endMs);
              if (!fromRoute) return trip;
              const driver = labelDriver(fromRoute);
              return driver === trip.driver ? trip : { ...trip, driver };
            });
            if (withDrivers.some((trip, index) => trip.driver !== derivedTrips[index]?.driver)) {
              setTrips(withDrivers);
            }
          }

          const routeTachoPoints = buildTachoPoints(
            routeReport.flatMap((point) => {
              const at = String(point.fixTime ?? point.deviceTime ?? point.serverTime ?? "");
              const atMs = Date.parse(at);
              if (!Number.isFinite(atMs) || atMs < windowStartMs || atMs > windowEndMs) return [];
              const speedKph = Math.max(0, Number(point.speed ?? 0) * 1.852);
              return [{
                atMs,
                lat: point.latitude,
                lng: point.longitude,
                speedKph,
                rpm: extractRpmRevPerSec(point.attributes as Record<string, unknown>) ?? undefined
              }];
            })
          );

          setTachoPoints(routeTachoPoints);
          applyFuelTrend(buildFuelTrendFromRoute(routeReport), routeReport);
        };

        const fetchTelemetryEvents = async (): Promise<any[]> => {
          if (!imei) return [];
          const query = new URLSearchParams();
          query.set("imei", imei);
          query.set("from", fromIso);
          query.set("to", toIso);
          query.set("limit", "5000");

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
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `HTTP ${response.status}`);
          }
          const payload = (await response.json()) as any;
          let rawEvents = Array.isArray(payload?.events) ? payload.events : [];

          if (rawEvents.length === 0) {
            const archiveQuery = new URLSearchParams(query);
            archiveQuery.set("includeArchive", "true");
            archiveQuery.set("includeArchivePayload", "true");
            archiveQuery.set("limit", "200");
            try {
              let archiveResponse = await fetch(buildApiUrl(`/telemetry/history?${archiveQuery.toString()}`), {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "content-type": "application/json",
                  "x-api-key": apiKey,
                  "x-tenant-id": tenantId
                }
              });
              if (archiveResponse.status === 404) {
                archiveResponse = await fetch(buildApiUrl(`/api/telemetry/history?${archiveQuery.toString()}`), {
                  method: "GET",
                  signal: controller.signal,
                  headers: {
                    "content-type": "application/json",
                    "x-api-key": apiKey,
                    "x-tenant-id": tenantId
                  }
                });
              }
              if (archiveResponse.ok) {
                const archivePayload = (await archiveResponse.json()) as any;
                const hot = Array.isArray(archivePayload?.events) ? archivePayload.events : [];
                const archives = Array.isArray(archivePayload?.archives) ? archivePayload.archives : [];
                const fromArchives = archives
                  .map((row: any) => {
                    const payloadBody = row?.payload;
                    if (!payloadBody || typeof payloadBody !== "object") return null;
                    const data =
                      payloadBody.data && typeof payloadBody.data === "object"
                        ? payloadBody.data
                        : payloadBody;
                    return {
                      id: String(row?.eventId ?? payloadBody.id ?? ""),
                      assetId: String(row?.assetId ?? payloadBody.assetId ?? ""),
                      imei: String(row?.imei ?? payloadBody.imei ?? ""),
                      createdAt: String(row?.createdAt ?? payloadBody.createdAt ?? ""),
                      data,
                      source: "b2-track-archive"
                    };
                  })
                  .filter(Boolean);
                rawEvents = [...hot, ...fromArchives];
              }
            } catch {
              // Archive backup is best-effort.
            }
          }
          return rawEvents;
        };

        // Prefetch telemetry while Traccar reports run — storage split made empty-Traccar
        // waterfalls common; overlapping the backup path restores snappy loads.
        let telemetryPrefetchError: unknown = null;
        const telemetryPrefetch = imei
          ? fetchTelemetryEvents()
              .catch((err) => {
                if (controller.signal.aborted) return [] as any[];
                telemetryPrefetchError = err;
                return [] as any[];
              })
          : Promise.resolve([] as any[]);

        const resolveTimelineDevice = async (): Promise<number | null> => {
          const assets = await getAssetsFromApi<any>();
          const selection = readStoredSelectionScope();
          const scopedAssets = (Array.isArray(assets) ? assets : []).filter((asset) => {
            const site = String(asset?.site ?? asset?.dbSite ?? asset?.databaseSite ?? "").trim();
            return matchesStoredSiteSelection(site, selection);
          });
          const searchPool = scopedAssets.length > 0 ? scopedAssets : (Array.isArray(assets) ? assets : []);
          const normalizedImei = toImei(imei || selectedRegistration);
          const normalizedReg = String(selectedRegistration ?? "").trim().toLowerCase();
          const normalizedAsset = String(selectedAsset ?? "").trim().toLowerCase();

          const findMatch = (pool: any[]) => {
            let found: any | undefined;
            if (normalizedImei) {
              found = pool.find((asset) => toImei(asset?.imei ?? asset?.uniqueId ?? "") === normalizedImei);
            }
            if (!found && normalizedReg) {
              found = pool.find((asset) => {
                const registration = String(asset?.registration ?? asset?.plate ?? asset?.name ?? "").trim().toLowerCase();
                return registration === normalizedReg || registration.includes(normalizedReg) || normalizedReg.includes(registration);
              });
            }
            if (!found && normalizedAsset) {
              found = pool.find((asset) => {
                const label = `${String(asset?.assetDescription ?? asset?.description ?? asset?.name ?? "").trim()} ${String(asset?.registration ?? "").trim()}`
                  .trim()
                  .toLowerCase();
                return label.includes(normalizedAsset) || normalizedAsset.includes(label);
              });
            }
            return found;
          };

          const match = findMatch(searchPool) ?? findMatch(Array.isArray(assets) ? assets : []);

          timelineAsset = match && typeof match === "object" ? (match as Record<string, unknown>) : null;

          const directDeviceId = Number(match?.traccarDeviceId ?? match?.deviceId);
          if (Number.isFinite(directDeviceId) && directDeviceId > 0) return directDeviceId;

          const lookupImei = toImei(match?.imei ?? match?.uniqueId ?? imei ?? selectedRegistration ?? "");
          if (!lookupImei) return null;

          const devices = await getTraccarDevices({ uniqueId: lookupImei });
          const lookedUpDeviceId = Number(devices[0]?.id);
          return Number.isFinite(lookedUpDeviceId) && lookedUpDeviceId > 0 ? lookedUpDeviceId : null;
        };

        const resolvedDeviceId = await resolveTimelineDevice();

        // CMS 808 / Karongo: tracks first, then Trip Detailed report (same source as the vendor preview).
        const plateLooksKnown = /ubp-?119h/i.test(
          `${selectedRegistration} ${selectedAsset} ${String((timelineAsset as any)?.registration ?? "")}`
        );
        if (cms808TripSourceAvailable() || plateLooksKnown) {
          const asset: Record<string, unknown> = timelineAsset ?? {};
          const plate = String(
            asset["vehiIdno"] ?? asset["registration"] ?? asset["plate"] ?? selectedRegistration ?? ""
          ).trim();
          const resolved = await resolveCms808DeviceId({
            imei: asset["imei"] ?? imei,
            cameraSerial: asset["cameraSerial"],
            assetId: asset["assetId"] ?? asset["id"],
            id: asset["id"],
            registration: plate || selectedRegistration,
            assetDescription: asset["assetDescription"] ?? selectedAsset
          }).catch(() => "");
          const fallbackDevice = [asset["devIdno"], asset["deviceId"], imei, selectedRegistration, CMS808_KNOWN_VEHICLE.devIdno]
            .map((value) => String(value ?? "").replace(/^cms808:/i, "").trim())
            .find((value) => /^\d{6,}$/.test(value)) || "";
          const devIdno = resolved || fallbackDevice || (plateLooksKnown ? String(CMS808_KNOWN_VEHICLE.devIdno) : "");
          if (devIdno) {
            const fromDate = new Date(windowStartMs - padMs);
            const toDate = new Date(windowEndMs + padMs);
            const plateOrKnown = plate || String(CMS808_KNOWN_VEHICLE.vehiIdno || "");
            let { trips: cmsTrips, trail } = await loadCms808TimelineTripsForDevice(
              devIdno,
              fromDate,
              toDate,
              plateOrKnown
            ).catch(() => ({ trips: [], trail: [] }));

            // Selected day empty but the Trip Detailed report has earlier trips — open that day.
            if (cmsTrips.length === 0) {
              const lookbackFrom = new Date(windowEndMs - 40 * 24 * 60 * 60 * 1000);
              // Report rows only (one fast request); the single day found is then loaded in full.
              const lookbackRows = await loadCms808MileageDetail(plateOrKnown || devIdno, lookbackFrom, toDate, devIdno).catch(() => []);
              const lookback = { trips: mapCms808MileageRowsToTimelineTrips(lookbackRows), trail: [] as typeof trail };
              if (lookback.trips.length > 0) {
                const latest = lookback.trips.reduce((best, trip) =>
                  Date.parse(trip.end) > Date.parse(best.end) ? trip : best
                );
                const latestStart = new Date(latest.start);
                if (!Number.isNaN(latestStart.getTime()) && !controller.signal.aborted) {
                  latestStart.setHours(0, 0, 0, 0);
                  const nextIso = toLocalDateTimeInputValue(latestStart);
                  if (nextIso !== selectedDateTime) {
                    setSelectedDateTime(nextIso);
                    setSelectedDateObj(latestStart);
                    setTimelineOffsetHours(0);
                    if (!controller.signal.aborted) endSavingDone("Opening last trip day");
                    return;
                  }
                }
                cmsTrips = lookback.trips;
                trail = lookback.trail;
              }
            }

            if (cmsTrips.length > 0 || trail.length > 0) {
              const derivedTrips: TimelineTrip[] = cmsTrips.map((trip) => ({
                driver: labelDriver(),
                registration: registrationLabel,
                start: trip.start,
                end: trip.end,
                duration: formatDurationFromMs(trip.durationMs),
                distance: `${trip.distanceKm.toFixed(2)} km`,
                maxSpeed: `${trip.maxSpeedKph.toFixed(0)} km/h`,
                fuelUsed: "N/A",
                segments: trip.segments
              }));
              if (controller.signal.aborted) return;
              const sortedTrips = derivedTrips.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
              setTrips(sortedTrips);
              setTachoPoints(
                buildTachoPoints(
                  trail.map((point) => ({
                    atMs: point.atMs,
                    lat: point.lat,
                    lng: point.lng,
                    speedKph: point.speedKph,
                    rpm: point.rpm
                  }))
                )
              );
              resetFuelTrend();
              // US Traccar notifications still come from /reports/events when a device id exists.
              if (resolvedDeviceId) {
                const eventReport = await getTraccarEvents({
                  deviceId: resolvedDeviceId,
                  from: fromIso,
                  to: toIso
                }).catch(() => [] as TraccarEvent[]);
                if (!controller.signal.aborted) {
                  const rawNotifications = mapTraccarEventsToRawNotifications(
                    eventReport,
                    sortedTrips,
                    windowStartMs,
                    windowEndMs
                  );
                  setRawTimelineNotifications(rawNotifications);
                  setNotificationEvents(
                    resolveRawTimelineNotifications(rawNotifications, notificationCatalogRef.current)
                  );
                }
              } else {
                setNotificationEvents([]);
                setRawTimelineNotifications([]);
              }
              if (!controller.signal.aborted) endSavingDone(sortedTrips.length ? "Loaded" : "No trips");
              return;
            }
          }
        }

        if (resolvedDeviceId) {
          // Trips-first: paint as soon as /reports/trips returns; enrich route/events after.
          const tripsPromise = getTraccarTrips({ deviceId: resolvedDeviceId, from: fromIso, to: toIso });
          const routePromise = getTraccarRoute({
            deviceId: resolvedDeviceId,
            from: fromIso,
            to: toIso,
            allowPositionsFallback: false
          });
          const eventsPromise = getTraccarEvents({ deviceId: resolvedDeviceId, from: fromIso, to: toIso });

          const tripReport = await tripsPromise;
          let derivedTrips = mapTraccarTrips(tripReport);

          if (derivedTrips.length > 0) {
            setTrips(derivedTrips);
            setTimelineLoading(false);
            if (!controller.signal.aborted) endSavingDone("Loaded");

            let routeReport = await routePromise;
            if (routeReport.length === 0) {
              routeReport = await getTraccarRoute({
                deviceId: resolvedDeviceId,
                from: fromIso,
                to: toIso,
                allowPositionsFallback: true
              });
            }
            const eventReport = await eventsPromise;
            if (controller.signal.aborted) return;
            enrichFromRouteAndEvents(derivedTrips, routeReport, eventReport);
            return;
          }

          let routeReport = await routePromise;
          if (routeReport.length <= 1) {
            routeReport = await getTraccarRoute({
              deviceId: resolvedDeviceId,
              from: fromIso,
              to: toIso,
              allowPositionsFallback: true
            });
          }

          if (derivedTrips.length === 0 && routeReport.length > 1) {
            const first = routeReport[0];
            const last = routeReport[routeReport.length - 1];
            const start = String(first?.fixTime ?? first?.deviceTime ?? fromIso);
            const end = String(last?.fixTime ?? last?.deviceTime ?? toIso);
            derivedTrips = [{
              driver: labelDriver(dominantRouteDriver(routeReport, Date.parse(start), Date.parse(end))),
              registration: registrationLabel,
              start,
              end,
              duration: formatDurationFromMs(Math.max(0, Date.parse(end) - Date.parse(start))),
              distance: "0.00 km",
              maxSpeed: `${Math.max(...routeReport.map((p) => Number(p.speed ?? 0) * 1.852), 0).toFixed(0)} km/h`,
              fuelUsed: "N/A",
              segments: [{ start, end, type: "moving" }]
            }];
          }

          if (derivedTrips.length > 0) {
            const eventReport = await eventsPromise;
            if (controller.signal.aborted) return;
            setTrips(derivedTrips);
            enrichFromRouteAndEvents(derivedTrips, routeReport, eventReport);
            if (!controller.signal.aborted) endSavingDone("Loaded");
            return;
          }
        }

        if (!imei) {
          setTrips([]);
          setNotificationEvents([]);
          setRawTimelineNotifications([]);
          setTachoPoints([]);
          resetFuelTrend();
          setTimelineError("Unable to resolve device IMEI for this asset.");
          if (!controller.signal.aborted) endSavingError("Unable to resolve device IMEI for this asset.");
          return;
        }

        const rawEvents = await telemetryPrefetch;
        if (rawEvents.length === 0 && telemetryPrefetchError) {
          throw telemetryPrefetchError;
        }

        const samples = rawEvents
          .map((row: any) => {
            const data = row?.data && typeof row.data === "object" ? row.data : {};
            const at = String(row?.createdAt ?? row?.created_at ?? row?.at ?? data?.lastSeen ?? "").trim();
            const atMs = Date.parse(at);
            if (!Number.isFinite(atMs)) return null;

            const speed = toFiniteNumber(data?.speed ?? data?.data?.speed ?? data?.attributes?.speed) ?? 0;
            const fuelUsed = toFiniteNumber(
              data?.fuelUsed ??
              data?.fuelConsumed ??
              data?.data?.fuelUsed ??
              data?.data?.fuelConsumed ??
              data?.attributes?.fuelUsed ??
              data?.attributes?.fuelConsumed
            );
            const movementRaw = String(data?.movement ?? data?.data?.movement ?? "").trim().toLowerCase();
            const moving = movementRaw === "moving" || speed > 2;
            const lat = toFiniteNumber(data?.lat ?? data?.latitude ?? data?.data?.lat ?? data?.data?.latitude);
            const lng = toFiniteNumber(data?.lng ?? data?.lon ?? data?.longitude ?? data?.data?.lng ?? data?.data?.lon ?? data?.data?.longitude);
            const notifications = extractDiscreteEventLabels(
              data && typeof data === "object" ? (data as Record<string, unknown>) : null
            );
            const driver = driverFromRecord(data) || driverFromRecord(row);
            const rpmFromData = extractRpmRevPerSec(data as Record<string, unknown>);
            const rpmRevPerSec = rpmFromData !== null ? rpmFromData : Math.max(0, speed * 0.42);

            return {
              at,
              atMs,
              speed,
              rpmRevPerSec,
              fuelUsed,
              moving,
              lat,
              lng,
              driver,
              notifications
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.atMs - b.atMs) as Array<{
          at: string;
          atMs: number;
          speed: number;
          rpmRevPerSec: number;
          fuelUsed: number | null;
          moving: boolean;
          lat: number | null;
          lng: number | null;
          driver: string;
          notifications: string[];
        }>;

        if (samples.length === 0) {
          setTrips([]);
          setNotificationEvents([]);
          setRawTimelineNotifications([]);
          setTachoPoints([]);
          resetFuelTrend();
          setTimelineError("");
          if (!controller.signal.aborted) endSavingDone("No trips");
          return;
        }

        const rawFuelTrend: FuelTrendPoint[] = [];
        for (const row of rawEvents) {
          const data = row?.data && typeof row.data === "object" ? row.data : {};
          const at = String(row?.createdAt ?? row?.created_at ?? row?.at ?? data?.lastSeen ?? "").trim();
          const atMs = Date.parse(at);
          if (!Number.isFinite(atMs)) continue;
          const liters = extractFuelLitersFromPayload(row) ?? extractFuelLitersFromPayload(data);
          if (typeof liters !== "number" || liters < 0) continue;
          const ignition = extractIgnitionFromPayload(row) ?? extractIgnitionFromPayload(data);
          rawFuelTrend.push(ignition === null ? { atMs, liters } : { atMs, liters, ignition });
        }

        type DraftTrip = {
          start: string;
          end: string;
          maxSpeed: number;
          distanceKm: number;
          fuelUsedLiters: number;
          lastAtMs: number;
          lastLat: number | null;
          lastLng: number | null;
          segments: { start: string; end: string; type: "moving" | "idle" }[];
          notifications: Array<{ type: string; at: string }>;
          driver: string;
        };

        const derivedTrips: TimelineTrip[] = [];
        const rawNotifications: RawTimelineNotification[] = [];
        let current: DraftTrip | null = null;

        const pushTrip = (trip: DraftTrip | null) => {
          if (!trip) return;
          const startMs = Date.parse(trip.start);
          const endMs = Date.parse(trip.end);
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return;
          const timelineTrip: TimelineTrip = {
            driver: labelDriver(trip.driver),
            registration: selectedRegistration || (selectedAsset.includes(" - ") ? selectedAsset.split(" - ").slice(-1)[0] : selectedAsset) || "N/A",
            start: trip.start,
            end: trip.end,
            duration: formatDurationFromMs(endMs - startMs),
            distance: `${trip.distanceKm.toFixed(2)} km`,
            maxSpeed: `${trip.maxSpeed.toFixed(0)} km/h`,
            fuelUsed: trip.fuelUsedLiters > 0 ? `${trip.fuelUsedLiters.toFixed(2)} L` : "N/A",
            segments: trip.segments
          };
          const tripIndex = derivedTrips.length;
          derivedTrips.push(timelineTrip);
          for (const event of trip.notifications) {
            rawNotifications.push({
              at: event.at,
              type: event.type,
              tripIndex
            });
          }
        };

        const mergeOrAppendSegment = (segments: { start: string; end: string; type: "moving" | "idle" }[], at: string, type: "moving" | "idle") => {
          const last = segments[segments.length - 1];
          if (!last || last.type !== type) {
            segments.push({ start: at, end: at, type });
          } else {
            last.end = at;
          }
        };

        for (const sample of samples) {
          const gapMs = current ? sample.atMs - current.lastAtMs : Number.POSITIVE_INFINITY;
          const gapTooLarge = gapMs > 20 * 60 * 1000;

          if (sample.moving) {
            if (!current || gapTooLarge) {
              pushTrip(current);
              current = {
                start: sample.at,
                end: sample.at,
                maxSpeed: sample.speed,
                distanceKm: 0,
                fuelUsedLiters: 0,
                lastAtMs: sample.atMs,
                lastLat: sample.lat,
                lastLng: sample.lng,
                segments: [{ start: sample.at, end: sample.at, type: "moving" }],
                notifications: [],
                driver: sample.driver
              };
            } else {
              current.end = sample.at;
              current.maxSpeed = Math.max(current.maxSpeed, sample.speed);
              mergeOrAppendSegment(current.segments, sample.at, "moving");
              current.driver = normalizeDriverName(current.driver, sample.driver);
            }
          } else if (current && !gapTooLarge) {
            current.end = sample.at;
            mergeOrAppendSegment(current.segments, sample.at, "idle");
            current.driver = normalizeDriverName(current.driver, sample.driver);
          }

          if (current) {
            if (
              current.lastLat !== null &&
              current.lastLng !== null &&
              sample.lat !== null &&
              sample.lng !== null &&
              sample.atMs > current.lastAtMs
            ) {
              const step = haversineKm(current.lastLat, current.lastLng, sample.lat, sample.lng);
              if (Number.isFinite(step) && step >= 0 && step < 200) {
                current.distanceKm += step;
              }
            }

            for (const label of sample.notifications) {
              if (!String(label ?? "").trim()) continue;
              current.notifications.push({
                type: String(label),
                at: sample.at
              });
            }

            if (sample.fuelUsed !== null && sample.fuelUsed > 0 && sample.fuelUsed < 500) {
              current.fuelUsedLiters += sample.fuelUsed;
            }

            current.lastAtMs = sample.atMs;
            current.lastLat = sample.lat;
            current.lastLng = sample.lng;
          }
        }

        pushTrip(current);

        if (derivedTrips.length === 0) {
          const first = samples[0];
          const last = samples[samples.length - 1];
          if (first && last) {
            derivedTrips.push({
              driver: labelDriver(first.driver, last.driver),
              registration: selectedRegistration || (selectedAsset.includes(" - ") ? selectedAsset.split(" - ").slice(-1)[0] : selectedAsset) || "N/A",
              start: first.at,
              end: last.at,
              duration: formatDurationFromMs(Math.max(0, last.atMs - first.atMs)),
              distance: "0.00 km",
              maxSpeed: "0 km/h",
              fuelUsed: "N/A",
              segments: [{ start: first.at, end: last.at, type: "idle" }]
            });
          }
        }

        setTrips(derivedTrips.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)));
        setRawTimelineNotifications(rawNotifications);
        setNotificationEvents(resolveRawTimelineNotifications(rawNotifications, notificationCatalogRef.current));
        setTachoPoints(
          buildTachoPoints(
            samples.map((sample) => ({
              atMs: sample.atMs,
              lat: sample.lat,
              lng: sample.lng,
              speedKph: sample.speed,
              rpm: sample.rpmRevPerSec > 0 ? sample.rpmRevPerSec : undefined
            }))
          )
        );
        applyFuelTrend(
          rawFuelTrend,
          samples.map((sample): TraccarRoutePoint => ({
            id: 0,
            deviceId: 0,
            protocol: "",
            serverTime: sample.at,
            deviceTime: sample.at,
            fixTime: sample.at,
            valid: true,
            latitude: sample.lat ?? 0,
            longitude: sample.lng ?? 0,
            altitude: 0,
            // Traccar speeds are knots; telemetry samples are km/h.
            speed: sample.speed / 1.852,
            course: 0,
            address: null,
            accuracy: 0,
            network: {},
            geofenceIds: [],
            attributes: {}
          }))
        );
        if (!controller.signal.aborted) endSavingDone("Loaded");
      } catch (error: any) {
        if (controller.signal.aborted) return;
        setTrips([]);
        setNotificationEvents([]);
        setRawTimelineNotifications([]);
        setTachoPoints([]);
        resetFuelTrend();
        setTimelineError(String(error?.message ?? error));
        endSavingError(String(error?.message ?? error ?? "Unable to load trips."));
      } finally {
        if (!controller.signal.aborted) setTimelineLoading(false);
      }
    };

    void loadTimeline();
    return () => {
      controller.abort();
      endSavingError();
    };
  }, [displayName, selectedAsset, selectedDateTime, selectedImei, selectedRegistration, timelineOffsetHours, timelineRange, timelineWindowMs, contextName, contextType]);

  useEffect(() => {
    setTimelineOffsetHours(0);
  }, [selectedDateTime]);

  useEffect(() => {
    let cancelled = false;

    const loadAssetOptions = async () => {
      try {
        const rows = await getAssetsFromApi<any>();
        const mapped = (Array.isArray(rows) ? rows : [])
          .map((asset) => {
            const description = String(asset?.assetDescription ?? asset?.description ?? asset?.name ?? "").trim();
            const registration = String(asset?.registration ?? asset?.plate ?? "").trim();
            const label = (description && registration)
              ? `${description} - ${registration}`
              : (description || registration || String(asset?.id ?? "").trim());
            const imei = toImei(asset?.imei ?? asset?.uniqueId ?? registration);
            const site = String(asset?.site ?? asset?.dbSite ?? asset?.databaseSite ?? "").trim().toLowerCase();
            const driver = resolveAssetDriverName(asset);
            return { label, registration, imei, site, driver };
          })
          .filter((item) => item.label.length > 0)
          .filter((item) => matchesStoredSiteSelection(item.site, readStoredSelectionScope()));

        const uniqueMap = new Map<string, { label: string; registration: string; imei: string }>();
        const driverKeys = new Map<string, string>();
        mapped.forEach((item) => {
          const key = item.label.toLowerCase();
          if (!uniqueMap.has(key)) {
            uniqueMap.set(key, { label: item.label, registration: item.registration, imei: item.imei });
          }
          if (!item.driver) return;
          for (const token of [item.label, item.registration, item.imei]) {
            const normalized = String(token ?? "").trim().toLowerCase();
            if (normalized) driverKeys.set(normalized, item.driver);
          }
        });
        assetDriverByKeyRef.current = driverKeys;

        const unique = Array.from(uniqueMap.values()).sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setAssetSelectorOptions(unique);
      } catch {
        if (cancelled) return;
        if (selectedAsset) {
          setAssetSelectorOptions([{ label: selectedAsset, registration: selectedRegistration, imei: selectedImei }]);
        }
      }
    };

    void loadAssetOptions();
    return () => {
      cancelled = true;
    };
  }, [selectedAsset, selectedImei, selectedRegistration, selectedSite]);

  const selectorOptions = useMemo(() => {
    if (viewMode === "assets") {
      if (assetSelectorOptions.length > 0) return assetSelectorOptions.map((item) => item.label);
      return selectedAsset ? [selectedAsset] : [];
    }
    return contextOptions;
  }, [assetSelectorOptions, contextOptions, selectedAsset, viewMode]);

  const openTimelineReport = () => {
    if (!baseStart) return;
    const windowStart = baseStart;
    const windowEnd = new Date(baseStart.getTime() + 24 * 60 * 60 * 1000);
    const reportTrips = trips.filter((trip) => {
      const tripStart = new Date(trip.start).getTime();
      const tripEnd = new Date(trip.end).getTime();
      return tripEnd > windowStart.getTime() && tripStart < windowEnd.getTime();
    });
    const format = (dt: Date) => `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${dt.getFullYear()} ${dt.getHours().toString().padStart(2, "0")}:${dt
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const totalDurationMs = reportTrips.reduce((sum, trip) => {
      const start = new Date(trip.start).getTime();
      const end = new Date(trip.end).getTime();
      return sum + Math.max(0, end - start);
    }, 0);
    const totalDistance = reportTrips.reduce((sum, trip) => sum + Number(trip.distance.replace(/[^0-9.]/g, "") || 0), 0);
    const reportHtml = `<!doctype html>
      <html><head><meta charset="utf-8" />
      <title>Activity Timeline Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; color: #6b7280; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
        th { background: #f3f4f6; }
      </style></head>
      <body>
        <h1>Activity Timeline Report - ${displayName}</h1>
        <h2>${format(windowStart)} - ${format(windowEnd)} EAT</h2>
        <h3 style="margin:16px 0 8px;">Overview</h3>
        <table>
          <tr>
            <th>Start time</th>
            <th>Driving time</th>
            <th>Idle time</th>
            <th>Standing time</th>
            <th>Total duration</th>
            <th>End time</th>
            <th>Time parked</th>
          </tr>
          <tr>
            <td>${format(windowStart)}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>${Math.round(totalDurationMs / 60000)} mins</td>
            <td>${format(windowEnd)}</td>
            <td>-</td>
          </tr>
        </table>
        <table>
          <tr>
            <th>Maximum speed</th>
            <th>Average speed</th>
            <th>Distance travelled</th>
            <th>Fuel used</th>
            <th>Fuel consumption</th>
            <th>Average standard score</th>
          </tr>
          <tr>
            <td>-</td>
            <td>-</td>
            <td>${totalDistance.toFixed(2)} km</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
          </tr>
        </table>
        <table>
          <tr>
            <th>Start time</th>
            <th>Stop time</th>
            <th>Odometer</th>
            <th>Distance</th>
            <th>Fuel</th>
            <th colspan="3">Over Speeding</th>
            <th colspan="3">Over Revving</th>
            <th colspan="3">Harsh Braking</th>
            <th colspan="3">Harsh Acceleration</th>
            <th colspan="2">Idle</th>
            <th>Average Standard Score</th>
          </tr>
          <tr>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th></th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Max</th>
            <th>Duration</th>
            <th>Count</th>
            <th>Duration</th>
            <th>Score</th>
          </tr>
          ${reportTrips
            .map(
              (trip) => `
              <tr>
                <td>${format(new Date(trip.start))}</td>
                <td>${format(new Date(trip.end))}</td>
                <td>-</td>
                <td>${trip.distance}</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
                <td>00:00:00</td>
                <td>-</td>
              </tr>`
            )
            .join("")}
        </table>
      </body></html>`;
    const reportWindow = window.open("", "_blank");
    if (!reportWindow) return;
    reportWindow.document.open();
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
  };

  const buildTachoCsv = () => {
    const header = "Notification Name,Start time,End time,Site";
    if (!baseStart) return header;
    const windowStart = baseStart.getTime();
    const windowEnd = windowStart + 24 * 60 * 60 * 1000;
    if (selectedNotifications.length === 0) {
      return header;
    }

    const notificationNameById = new Map(
      notifications.map((notif) => [notif.id, notif.name])
    );

    const rows = notificationEvents
      .filter((event) => selectedNotifications.includes(event.id))
      .map((event) => {
        const eventStart = new Date(event.at).getTime();
        if (!Number.isFinite(eventStart) || eventStart < windowStart || eventStart > windowEnd) return null;
        return {
          at: event.at,
          endAt: event.at,
          name: notificationNameById.get(event.id) ?? event.id,
          site: ""
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a!.at).getTime() - new Date(b!.at).getTime())
      .map((row) => `${row!.name},${formatDateTime(new Date(row!.at))},${formatDateTime(new Date(row!.endAt))},${row!.site}`);

    const metaRows = [
      `Site,${selectedSite || ""}`,
      `Registration,${selectedRegistration || ""}`,
      "",
      header
    ];
    if (rows.length === 0) return metaRows.join("\n");
    return [...metaRows, ...rows].join("\n");
  };

  const handleMoreMenuAction = (label: string) => {
    setShowMoreMenu(false);
    if (label === "Timeline settings") {
      alert("Timeline settings coming soon.");
      return;
    }
    if (label === "Timeline report") {
      openTimelineReport();
      return;
    }
    if (label === "Download GPS data") {
      handleDownload("gps-data.csv", "timestamp,lat,lng\n2026-01-19T10:08:00Z,-1.2833,36.8167");
      showDownloadNotice("Download requested successfully.");
      return;
    }
    if (label === "Download Tacho Graph") {
      handleDownload("tacho-data.csv", buildTachoCsv());
      showDownloadNotice("Download requested successfully.");
      return;
    }
    if (label === "Download video") {
      const defaultWindow = buildDefaultVideoWindow(selectedDateTime || nowIso);
      setVideoFrom(defaultWindow.from);
      setVideoTo(defaultWindow.to);
      setVideoResolution("HD (1080p)");
      setShowVideoModal(true);
      return;
    }
  };

  useEffect(() => {
    if (!draggingQueryLine) return;
    document.body.classList.add("no-select");
    const handleMove = (event: MouseEvent) => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clamped = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
      const pct = rect.width === 0 ? 0 : (clamped / rect.width) * 100;
      setQueryLinePct(pct);
    };
    const handleUp = () => setDraggingQueryLine(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      document.body.classList.remove("no-select");
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingQueryLine]);

  useEffect(() => {
    if (draggingQueryLine) return;
    document.body.classList.remove("no-select");
  }, [draggingQueryLine]);

  useEffect(() => {
    notificationCatalogRef.current = notificationCatalog;
  }, [notificationCatalog]);

  // Re-resolve stored raw events once the bound notification catalog is available/updated.
  useEffect(() => {
    if (rawTimelineNotifications.length === 0) return;
    setNotificationEvents(resolveRawTimelineNotifications(rawTimelineNotifications, notificationCatalog));
  }, [notificationCatalog, rawTimelineNotifications]);

  useEffect(() => {
    let cancelled = false;
    const reloadBoundNotifications = async () => {
      try {
        const options = await loadBoundNotificationOptionsForSite(readActiveSiteName());
        if (cancelled) return;
        registerBoundNotificationAliases(options);
        setNotificationCatalog(boundOptionsToNotificationRows(options));
      } catch {
        if (!cancelled) setNotificationCatalog([]);
      }
    };
    void reloadBoundNotifications();
    window.addEventListener("vivi:orgchange", reloadBoundNotifications);
    window.addEventListener("vivi:contextchange", reloadBoundNotifications);
    window.addEventListener("vivi:bindingschange", reloadBoundNotifications);
    window.addEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundNotifications);
    return () => {
      cancelled = true;
      window.removeEventListener("vivi:orgchange", reloadBoundNotifications);
      window.removeEventListener("vivi:contextchange", reloadBoundNotifications);
      window.removeEventListener("vivi:bindingschange", reloadBoundNotifications);
      window.removeEventListener(NOTIFICATION_LIBRARY_UPDATED_EVENT, reloadBoundNotifications);
    };
  }, []);

  // Use notifications bound for the active site (Notifications Bindings monitored events).
  const notifications = useMemo(
    () => notificationCatalog.map((row, idx) => ({ id: String(idx + 1), name: row.description })),
    [notificationCatalog]
  );
  const filteredNotifications = notificationFilter.trim()
    ? notifications.filter(n => n.name.toLowerCase().includes(notificationFilter.trim().toLowerCase()))
    : notifications;

  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    el.indeterminate = !!(
      filteredNotifications.some(n => selectedNotifications.includes(n.id))
      && !filteredNotifications.every(n => selectedNotifications.includes(n.id))
    );
  }, [filteredNotifications, selectedNotifications]);

  const notificationIdToRowKey = useMemo(() => buildNotificationIdToRowKey(notifications), [notifications]);

  useEffect(() => {
    if (selectedNotifications.length > 0) return;
    // Seed only ignition on/off when nothing is selected — not the full catalog mock list.
    const defaults = ["Ignition on", "Ignition off"]
      .map((label) => resolveNotificationIdByLabel(notificationCatalog, label))
      .filter((id): id is string => Boolean(id));
    if (defaults.length) setSelectedNotifications(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationCatalog]);

  useEffect(() => {
    writeUserPrefJson(USER_PREF_KEYS.tripTimelineSelectedNotifications, selectedNotifications);
  }, [selectedNotifications]);

  const visibleNotificationEvents = useMemo(
    () => notificationEvents.filter((event) => selectedNotifications.includes(event.id)),
    [notificationEvents, selectedNotifications]
  );

  const visibleTimelineRows = useMemo(
    () => buildVisibleTimelineRows(selectedNotifications, notifications),
    [selectedNotifications, notifications]
  );

  const eventsByRowKey = useMemo(() => {
    const grouped = new Map<TimelineRowKey, NotificationEvent[]>();
    for (const row of visibleTimelineRows) {
      grouped.set(row.key, []);
    }
    for (const event of visibleNotificationEvents) {
      let rowKey = notificationIdToRowKey.get(event.id) ?? null;
      if (!rowKey && event.ignitionState === "on") rowKey = "ignition-on";
      if (!rowKey && event.ignitionState === "off") rowKey = "ignition-off";
      if (!rowKey || !grouped.has(rowKey)) continue;
      grouped.get(rowKey)?.push(event);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    }
    return grouped;
  }, [visibleNotificationEvents, notificationIdToRowKey, visibleTimelineRows]);

  const queryTimeMs = useMemo(() => {
    if (!timelineWindow) return null;
    const { windowStart, windowEnd } = timelineWindow;
    return windowStart + (queryLinePct / 100) * (windowEnd - windowStart);
  }, [timelineWindow, queryLinePct]);

  const querySnapshot = useMemo(() => {
    if (!queryTimeMs || !timelineWindow) return null;
    const toleranceMs = 90 * 1000;
    const trip =
      visibleTrips.find((item) => {
        const start = Date.parse(item.start);
        const end = Date.parse(item.end);
        return Number.isFinite(start) && Number.isFinite(end) && queryTimeMs >= start && queryTimeMs <= end;
      }) ?? null;
    const events = visibleNotificationEvents.filter((event) => {
      const at = Date.parse(event.at);
      return Number.isFinite(at) && Math.abs(at - queryTimeMs) <= toleranceMs;
    });
    const duration = timelineWindow.windowEnd - timelineWindow.windowStart;
    return { trip, events };
  }, [queryTimeMs, timelineWindow, visibleTrips, visibleNotificationEvents]);

  const continuousSpansByRow = useMemo(() => {
    const map = new Map<TimelineRowKey, TimelineEventSpan[]>();
    if (!timelineWindow) return map;
    const { windowStart, windowEnd } = timelineWindow;
    for (const row of visibleTimelineRows) {
      if (row.renderMode !== "continuous") continue;
      map.set(row.key, buildContinuousSpans(eventsByRowKey.get(row.key) ?? [], windowStart, windowEnd));
    }
    return map;
  }, [eventsByRowKey, timelineWindow, visibleTimelineRows]);

  const queryHitsByRow = useMemo(() => {
    const hits = new Map<
      TimelineRowKey,
      {
        notifName: string;
        startAt: string;
        endAt?: string;
        durationMs: number;
        location?: string;
        eventValue?: string;
      }
    >();
    if (!queryTimeMs || !timelineWindow) return hits;
    const toleranceMs = 90 * 1000;
    for (const row of visibleTimelineRows) {
      if (row.renderMode === "continuous") {
        const spans = continuousSpansByRow.get(row.key) ?? [];
        const span = spans.find((entry) => queryTimeMs >= entry.startMs && queryTimeMs <= entry.endMs);
        if (!span) continue;
        hits.set(row.key, {
          notifName: notifications.find((n) => n.id === span.event.id)?.name ?? row.label,
          startAt: new Date(span.startMs).toISOString(),
          endAt: new Date(span.endMs).toISOString(),
          durationMs: Math.max(0, span.endMs - span.startMs),
          location: span.event.location,
          eventValue: span.event.eventValue ?? "0"
        });
        continue;
      }
      const matched = (eventsByRowKey.get(row.key) ?? [])
        .map((event) => ({ event, atMs: Date.parse(event.at) }))
        .filter((entry) => Number.isFinite(entry.atMs) && Math.abs(entry.atMs - queryTimeMs) <= toleranceMs)
        .sort((left, right) => Math.abs(left.atMs - queryTimeMs) - Math.abs(right.atMs - queryTimeMs))[0];
      if (!matched) continue;
      const durationSec = Math.max(1, Math.round((matched.event.durationMinutes ?? 0) * 60) || 1);
      hits.set(row.key, {
        notifName: notifications.find((n) => n.id === matched.event.id)?.name ?? row.label,
        startAt: matched.event.at,
        durationMs: durationSec * 1000,
        location: matched.event.location,
        eventValue: matched.event.eventValue ?? "0"
      });
    }
    return hits;
  }, [
    queryTimeMs,
    timelineWindow,
    eventsByRowKey,
    continuousSpansByRow,
    visibleTimelineRows,
    notifications
  ]);

  const tripQueryHit = Boolean(querySnapshot?.trip);


  const adjustTimeByMinutes = (deltaMinutes: number) => {
    const base = new Date(selectedDateObj);
    base.setMinutes(base.getMinutes() + deltaMinutes);
    const updated = `${base.getHours().toString().padStart(2, "0")}:${base.getMinutes().toString().padStart(2, "0")}`;
    setSelectedTime(updated);
    syncDateTime(base, updated);
  };

  const syncDateTime = (date: Date, timeValue?: string) => {
    const base = new Date(date);
    const [hours, minutes] = (timeValue ?? selectedTime).split(":").map((v) => Number(v));
    if (!Number.isNaN(hours)) base.setHours(hours);
    if (!Number.isNaN(minutes)) base.setMinutes(minutes);
    base.setSeconds(0, 0);
    setSelectedDateObj(base);
    setSelectedDateTime(toLocalDateTimeInputValue(base));
  };

  return (
    <div className="trip-page" style={{ position: "relative" }}>
      {timelineLoading && (
        <div className="vt-loader-overlay">
          <VTLoader label="Loading trip timeline" />
        </div>
      )}
      {downloadNotice && (
        <div className="trip-download-toast" role="status" aria-live="polite">
          <span className="trip-download-toast-icon" aria-hidden="true">✓</span>
          <span>{downloadNotice}</span>
        </div>
      )}
      <header className="trip-toolbar">
        <div className="trip-toolbar-left">
          {isPersonTimeline && (
            <label className="trip-context-select">
              <span className="trip-context-label">
                {contextType === "passenger" ? "Passenger" : "Driver"}
              </span>
              <select
                value={contextName}
                onChange={(event) => {
                  const next = event.target.value;
                  setContextName(next);
                  writeUserPref(USER_PREF_KEYS.contextName, next);
                  window.dispatchEvent(new Event("vivi:contextchange"));
                }}
              >
                {contextOptions.length === 0 && <option value="">Select</option>}
                {contextOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="trip-datetime">
            <button
              type="button"
              className="trip-datetime-value-btn"
              onClick={() => {
                setActivePicker("date");
                setIsDatepickerOpen(true);
              }}
              title="Selected date and time"
            >
              {selectedDateObj
                ? `${selectedDateObj.getDate().toString().padStart(2, "0")}/${(selectedDateObj.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}/${selectedDateObj.getFullYear()} ${selectedDateObj
                    .getHours()
                    .toString()
                    .padStart(2, "0")}:${selectedDateObj.getMinutes().toString().padStart(2, "0")}`
                : ""}
            </button>
            <button
              type="button"
              className="trip-toolbar-chip"
              onClick={() => {
                setActivePicker("date");
                setIsDatepickerOpen(true);
              }}
              aria-label="Open calendar"
              data-tooltip="Calendar"
              title="Open calendar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 9h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="trip-toolbar-chip"
              onClick={() => {
                if (latestTripEnd) {
                  const iso = toLocalDateTimeInputValue(latestTripEnd);
                  setSelectedDateTime(iso);
                  setSelectedDateObj(new Date(latestTripEnd));
                  setSelectedTime(
                    `${latestTripEnd.getHours().toString().padStart(2, "0")}:${latestTripEnd
                      .getMinutes()
                      .toString()
                      .padStart(2, "0")}`
                  );
                }
              }}
              aria-label="Last trip"
              data-tooltip="Last trip"
              title="Jump to latest trip end time"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M3 12a9 9 0 1 0 3-6.7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path d="M3 4v5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="trip-toolbar-chip trip-toolbar-chip--text"
              onClick={() => setShowSelectorModal(true)}
              aria-label="Select"
              data-tooltip="Select asset, driver, or passenger"
              title="Select asset, driver, or passenger"
            >
              Select
            </button>
          </div>

          <div className="trip-timeline-range-tabs" role="tablist" aria-label="Timeline zoom">
            {ranges.map((range) => (
              <button
                key={range}
                type="button"
                role="tab"
                aria-selected={timelineRange === range}
                className={`trip-timeline-range-tab${timelineRange === range ? " active" : ""}`}
                onClick={() => setTimelineRange(range)}
              >
                {range}
              </button>
            ))}
            <span className="trip-timeline-range">
              {baseStart
                ? `${formatDateTime(baseStart)} - ${formatDateTime(new Date(baseStart.getTime() + timelineWindowMs))} EAT`
                : ""}
            </span>
          </div>
        </div>

        <div className="trip-toolbar-right">
          {!isPersonTimeline && (
            <button
              className="live-topbar-chip"
              type="button"
              aria-label="Notifications"
              data-tooltip="Notifications"
              onClick={() => setShowNotifications(true)}
            >
              <span className="live-chip-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                  <path d="M9 19a3 3 0 006 0" />
                </svg>
              </span>
              {selectedNotifications.length}
            </button>
          )}
          {visibleToolIcons.map((tool) => (
            <button
              key={tool.label}
              className={`trip-icon-btn${tool.label === "Query line" && showQueryLine ? " active" : ""}`}
              type="button"
              aria-label={tool.label}
              data-tooltip={tool.label}
              onClick={() => handleToolAction(tool.label)}
            >
              {tool.icon}
            </button>
          ))}
          <div style={{ display: "inline-block", position: "relative" }}>
            <button
              className="trip-icon-btn"
              type="button"
              aria-label="Actions"
              title="Actions"
              onClick={() => setShowMoreMenu((open) => !open)}
            >
              ⋯
            </button>
            {showMoreMenu && (
              <div
                className="trip-more-menu"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 36,
                  minWidth: 200,
                  zIndex: 1000
                }}
              >
                {visibleMoreMenuOptions.map((opt) => (
                  <button
                    key={opt.label}
                    className="trip-more-item"
                    onClick={() => handleMoreMenuAction(opt.label)}
                    onMouseDown={e => e.preventDefault()}
                  >
                    <span className="trip-more-icon" aria-hidden="true">{opt.icon}</span>
                    <span className="trip-more-label">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {showSelectorModal && (
        <div className="trip-selector-modal-overlay" onClick={() => setShowSelectorModal(false)}>
          <div className="trip-selector-modal" onClick={(e) => e.stopPropagation()}>
            <div className="trip-selector-header">
              <h3>Select Device, Driver, or Passenger</h3>
              <button type="button" onClick={() => setShowSelectorModal(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
            </div>
            <div className="trip-selector-types">
              <button
                type="button"
                className={`trip-selector-type-btn${viewMode === "assets" ? " active" : ""}`}
                onClick={() => handleViewModeChange("assets")}
              >
                Assets
              </button>
              <button
                type="button"
                className={`trip-selector-type-btn${viewMode === "drivers" ? " active" : ""}`}
                onClick={() => handleViewModeChange("drivers")}
              >
                Drivers
              </button>
              <button
                type="button"
                className={`trip-selector-type-btn${viewMode === "passengers" ? " active" : ""}`}
                onClick={() => handleViewModeChange("passengers")}
              >
                Passengers
              </button>
            </div>
            <div className="trip-selector-list">
              {selectorOptions.length === 0 ? (
                <div style={{ padding: '16px', color: '#999', textAlign: 'center' }}>No options available</div>
              ) : (
                selectorOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`trip-selector-option${(viewMode === "assets" ? selectedAsset : contextName) === option ? " active" : ""}`}
                    onClick={() => {
                      if (viewMode === "assets") {
                        const selected = assetSelectorOptions.find((item) => item.label === option);
                        setSelectedAsset(option);
                        setContextType("asset");
                        setContextName("");
                        writeUserPref(USER_PREF_KEYS.contextType, "asset");
                        writeActiveAssetPrefs({
                          asset: option,
                          registration: selected?.registration ?? "",
                          imei: selected?.imei ?? ""
                        });
                        if (selected?.registration) {
                          setSelectedRegistration(selected.registration);
                        }
                        if (selected?.imei) {
                          setSelectedImei(selected.imei);
                        }
                      } else {
                        setContextName(option);
                        writeUserPref(USER_PREF_KEYS.contextName, option);
                      }
                      window.dispatchEvent(new Event("vivi:contextchange"));
                      setShowSelectorModal(false);
                    }}
                  >
                    {option}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ScheduleDateTimePicker
        open={isDatepickerOpen}
        date={selectedDateObj}
        time={selectedTime}
        mode={activePicker}
        onClose={() => setIsDatepickerOpen(false)}
        onConfirm={() => setIsDatepickerOpen(false)}
        onDateChange={(date) => syncDateTime(date)}
        onTimeChange={(time) => {
          setSelectedTime(time);
          syncDateTime(selectedDateObj, time);
        }}
        onModeChange={setActivePicker}
        title="Date and time"
        restrictToPast
      />

      {showVideoModal && (
        <div className="trip-video-modal" role="dialog" aria-modal="true" aria-label="Download video">
          <div className="trip-video-card">
            <div className="trip-video-header">
              <div>Download video</div>
              <button
                type="button"
                className="trip-video-close"
                onClick={() => setShowVideoModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="trip-video-body">
              <label className="trip-video-field">
                <span>From</span>
                <button
                  type="button"
                  className="trip-video-date-btn"
                  onClick={() => {
                    setVideoPickerTarget("from");
                    const date = new Date(videoFrom);
                    setVideoPickerDateObj(date);
                    setVideoPickerTime(`${date.getHours().toString().padStart(2, "0")}:${date
                      .getMinutes()
                      .toString()
                      .padStart(2, "0")}`);
                    setVideoPickerActive("date");
                    setVideoPickerOpen(true);
                  }}
                >
                  {formatDisplayDateTime(videoFrom)}
                </button>
              </label>
              <label className="trip-video-field">
                <span>to</span>
                <button
                  type="button"
                  className="trip-video-date-btn"
                  onClick={() => {
                    setVideoPickerTarget("to");
                    const date = new Date(videoTo);
                    setVideoPickerDateObj(date);
                    setVideoPickerTime(`${date.getHours().toString().padStart(2, "0")}:${date
                      .getMinutes()
                      .toString()
                      .padStart(2, "0")}`);
                    setVideoPickerActive("date");
                    setVideoPickerOpen(true);
                  }}
                >
                  {formatDisplayDateTime(videoTo)}
                </button>
              </label>
              <div className="trip-video-section">Select which video views you would like to download</div>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("Road")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "Road"]
                      : current.filter((v) => v !== "Road"));
                  }}
                />
                Road
              </label>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("In Cab")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "In Cab"]
                      : current.filter((v) => v !== "In Cab"));
                  }}
                />
                In Cab
              </label>
              <label className="trip-video-checkbox">
                <input
                  type="checkbox"
                  checked={videoViews.includes("Driver")}
                  onChange={(e) => {
                    setVideoViews((current) => e.target.checked
                      ? [...current, "Driver"]
                      : current.filter((v) => v !== "Driver"));
                  }}
                />
                Driver
              </label>
              <label className="trip-video-field">
                <span>Download resolution</span>
                <select
                  value={videoResolution}
                  onChange={(e) => setVideoResolution(e.target.value)}
                >
                  <option>HD (1080p)</option>
                  <option>4K (2160p)</option>
                </select>
              </label>
              <div className="trip-video-note">
                HD is the default for all saved and downloaded video. Choose 4K only when you need a higher-resolution export.
              </div>
              <div className="trip-video-note">
                New video download requests default to a 2-minute clip window. Adjust the start or end time only when the export needs a different span.
              </div>
              <div className="trip-video-note">
                You will receive an email confirmation when the video is ready for viewing. Please note, this may take some time.
              </div>
            </div>
            <div className="trip-video-actions">
              <button type="button" className="trip-video-cancel" onClick={() => setShowVideoModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="trip-video-submit"
                onClick={() => {
                  setShowVideoModal(false);
                  showDownloadNotice("Video download request submitted.");
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {videoPickerOpen && (
        <div className="trip-datetime-modal" role="dialog" aria-modal="true" aria-label="Select video time">
          <TripDateTimePickerPanel
            date={videoPickerDateObj}
            time={videoPickerTime}
            mode={videoPickerActive}
            restrictToPast
            onDateChange={setVideoPickerDateObj}
            onTimeChange={setVideoPickerTime}
            onModeChange={setVideoPickerActive}
            onDone={() => {
              const [hours, minutes] = videoPickerTime.split(":").map((v) => Number(v));
              const next = new Date(videoPickerDateObj);
              if (!Number.isNaN(hours)) next.setHours(hours);
              if (!Number.isNaN(minutes)) next.setMinutes(minutes);
              next.setSeconds(0, 0);
              const value = toLocalDateTimeInputValue(next);
              if (videoPickerTarget === "from") {
                setVideoFrom(value);
              } else {
                setVideoTo(value);
              }
              setVideoPickerOpen(false);
            }}
          />
        </div>
      )}

      {showTachoModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Tacho data chart">
          <div className="assets-add-card fuel-tachograph-card">
            <div className="assets-add-header">
              <div className="assets-add-title">
                Tacho data - Reg: {String(selectedRegistration || selectedAsset || "Unknown").trim()}
              </div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setTachoHoverIndex(null);
                    setShowTachoModal(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="assets-add-body fuel-tachograph-body">
              <div className="fuel-tachograph-meta">
                <div>
                  <strong>Asset:</strong> {displayName || "N/A"}
                </div>
                <div>
                  <strong>Points:</strong> {tachoChartGeometry.points.length}
                </div>
              </div>
              <div className="fuel-tachograph-canvas" aria-live="polite">
                <svg
                  ref={tachoChartSvgRef}
                  viewBox={`0 0 ${tachoChartGeometry.width} ${tachoChartGeometry.height}`}
                  className="fuel-tachograph-svg"
                  role="img"
                  aria-label="Speed and RPM trend chart"
                  style={{ cursor: "crosshair" }}
                  onMouseMove={(event) => updateTachoHoverFromClientX(event.clientX)}
                  onMouseLeave={() => setTachoHoverIndex(null)}
                >
                  <rect x="0" y="0" width={tachoChartGeometry.width} height={tachoChartGeometry.height} fill="#f8fafc" />

                  {tachoChartGeometry.yTicks.map((tick, index) => (
                    <g key={`y-${index}`}>
                      <line
                        x1={tachoChartGeometry.left}
                        y1={tick.y}
                        x2={tachoChartGeometry.left + tachoChartGeometry.innerWidth}
                        y2={tick.y}
                        stroke="#cbd5e1"
                        strokeDasharray="3 3"
                      />
                      <text x={tachoChartGeometry.left - 10} y={tick.y + 4} textAnchor="end" fill="#7a1b1b" fontSize="11">
                        {tick.speedKph.toFixed(0)}
                      </text>
                      <text x={tachoChartGeometry.left + tachoChartGeometry.innerWidth + 10} y={tick.y + 4} textAnchor="start" fill="#16a34a" fontSize="11">
                        {tick.rpmRevPerSec.toFixed(1)}
                      </text>
                    </g>
                  ))}

                  {tachoChartGeometry.xTicks.map((tick, idx) => (
                    <g key={`x-${idx}`}>
                      <line
                        x1={tick.x}
                        y1={tachoChartGeometry.top}
                        x2={tick.x}
                        y2={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                        stroke="#e2e8f0"
                      />
                      <text
                        x={tick.x}
                        y={tachoChartGeometry.top + tachoChartGeometry.innerHeight + 18}
                        textAnchor="middle"
                        fill="#334155"
                        fontSize="11"
                      >
                        {formatChartTime(tick.atMs)}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={tachoChartGeometry.left}
                    y1={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                    x2={tachoChartGeometry.left + tachoChartGeometry.innerWidth}
                    y2={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                    stroke="#334155"
                    strokeWidth="1.3"
                  />
                  <line
                    x1={tachoChartGeometry.left}
                    y1={tachoChartGeometry.top}
                    x2={tachoChartGeometry.left}
                    y2={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                    stroke="#7a1b1b"
                    strokeWidth="1.4"
                  />
                  <line
                    x1={tachoChartGeometry.left + tachoChartGeometry.innerWidth}
                    y1={tachoChartGeometry.top}
                    x2={tachoChartGeometry.left + tachoChartGeometry.innerWidth}
                    y2={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                    stroke="#16a34a"
                    strokeWidth="1.4"
                  />

                  <text
                    x={tachoChartGeometry.left + tachoChartGeometry.innerWidth / 2}
                    y={tachoChartGeometry.height - 8}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="600"
                  >
                    Time
                  </text>
                  <text
                    x="16"
                    y={tachoChartGeometry.top + tachoChartGeometry.innerHeight / 2}
                    transform={`rotate(-90 16 ${tachoChartGeometry.top + tachoChartGeometry.innerHeight / 2})`}
                    textAnchor="middle"
                    fill="#7a1b1b"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Speed (kph)
                  </text>
                  <text
                    x={tachoChartGeometry.width - 16}
                    y={tachoChartGeometry.top + tachoChartGeometry.innerHeight / 2}
                    transform={`rotate(90 ${tachoChartGeometry.width - 16} ${tachoChartGeometry.top + tachoChartGeometry.innerHeight / 2})`}
                    textAnchor="middle"
                    fill="#16a34a"
                    fontSize="12"
                    fontWeight="700"
                  >
                    RPM (Rev/s)
                  </text>

                  {tachoChartGeometry.speedPath && (
                    <path
                      d={tachoChartGeometry.speedPath}
                      fill="none"
                      stroke="#7a1b1b"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {tachoChartGeometry.rpmPath && (
                    <path
                      d={tachoChartGeometry.rpmPath}
                      fill="none"
                      stroke="#16a34a"
                      strokeWidth="1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      opacity="0.9"
                    />
                  )}

                  {tachoHoverIndex !== null && tachoChartGeometry.pointDots[tachoHoverIndex] && (
                    <>
                      <line
                        x1={tachoChartGeometry.pointDots[tachoHoverIndex].x}
                        y1={tachoChartGeometry.top}
                        x2={tachoChartGeometry.pointDots[tachoHoverIndex].x}
                        y2={tachoChartGeometry.top + tachoChartGeometry.innerHeight}
                        stroke="#475569"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                        pointerEvents="none"
                      />
                      <circle
                        cx={tachoChartGeometry.pointDots[tachoHoverIndex].x}
                        cy={tachoChartGeometry.pointDots[tachoHoverIndex].speedY}
                        r="3.5"
                        fill="#7a1b1b"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                        pointerEvents="none"
                      />
                      <circle
                        cx={tachoChartGeometry.pointDots[tachoHoverIndex].x}
                        cy={tachoChartGeometry.pointDots[tachoHoverIndex].rpmY}
                        r="3.5"
                        fill="#16a34a"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                        pointerEvents="none"
                      />
                      <g
                        pointerEvents="none"
                        transform={`translate(${Math.min(
                          tachoChartGeometry.width - 178,
                          Math.max(16, tachoChartGeometry.pointDots[tachoHoverIndex].x + 12)
                        )} ${Math.max(
                          18,
                          Math.min(
                            tachoChartGeometry.pointDots[tachoHoverIndex].speedY,
                            tachoChartGeometry.pointDots[tachoHoverIndex].rpmY
                          ) - 54
                        )})`}
                      >
                        <rect x="0" y="0" width="168" height="52" rx="6" fill="rgba(15, 23, 42, 0.92)" />
                        <text x="8" y="15" fill="#e2e8f0" fontSize="11">
                          {formatFuelChartTime(tachoChartGeometry.pointDots[tachoHoverIndex].atMs)}
                        </text>
                        <text x="8" y="31" fill="#fca5a5" fontSize="11" fontWeight="700">
                          {`Speed: ${tachoChartGeometry.pointDots[tachoHoverIndex].speedKph.toFixed(0)} kph`}
                        </text>
                        <text x="8" y="45" fill="#86efac" fontSize="11" fontWeight="700">
                          {`RPM: ${tachoChartGeometry.pointDots[tachoHoverIndex].rpmRevPerSec.toFixed(1)} Rev/s`}
                        </text>
                      </g>
                    </>
                  )}
                </svg>

                {timelineLoading && <div className="fuel-tachograph-hint">Loading Tacho Graph data...</div>}
                {!timelineLoading && tachoChartGeometry.points.length === 0 && (
                  <div className="fuel-tachograph-hint">No speed or RPM points found in this 24-hour window.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showFuelTachoModal && (
        <div className="assets-add-modal" role="dialog" aria-modal="true" aria-label="Fuel Tacho Graph">
          <div className="assets-add-card fuel-tachograph-card">
            <div className="assets-add-header">
              <div className="assets-add-title">
                Fuel Tacho - Reg: {String(selectedRegistration || selectedAsset || "Unknown").trim()}
              </div>
              <div className="assets-add-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setFuelHoverIndex(null);
                    setShowFuelTachoModal(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="assets-add-body fuel-tachograph-body">
              <div className="fuel-tachograph-nav" aria-label="Fuel Tacho Graph date navigation">
                <button
                  type="button"
                  className="fuel-tachograph-nav-btn"
                  aria-label="Previous day"
                  onClick={() => shiftFuelTachoWindow(-24)}
                >
                  ◀◀
                </button>
                <button
                  type="button"
                  className="fuel-tachograph-nav-btn"
                  aria-label="Previous hour"
                  onClick={() => shiftFuelTachoWindow(-1)}
                >
                  ◀
                </button>
                <div className="fuel-tachograph-range">{fuelTachoWindowLabel}</div>
                <button
                  type="button"
                  className="fuel-tachograph-nav-btn"
                  aria-label="Next hour"
                  onClick={() => shiftFuelTachoWindow(1)}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="fuel-tachograph-nav-btn"
                  aria-label="Next day"
                  onClick={() => shiftFuelTachoWindow(24)}
                >
                  ▶▶
                </button>
              </div>
              <div className="fuel-tachograph-meta">
                <div>
                  <strong>Asset:</strong> {displayName || "N/A"}
                </div>
                {fuelSummary && (
                  <>
                    <div>
                      <strong>Start:</strong> {fuelSummary.startLiters.toFixed(1)} L
                      {" · "}
                      <strong>End:</strong> {fuelSummary.endLiters.toFixed(1)} L
                      {" · "}
                      <strong>Change:</strong>{" "}
                      {fuelSummary.changeLiters >= 0 ? "+" : ""}
                      {fuelSummary.changeLiters.toFixed(1)} L
                    </div>
                    <div>
                      <strong>Events:</strong> {fuelSummary.refuelCount} refuel{fuelSummary.refuelCount === 1 ? "" : "s"}
                      {", "}
                      {fuelSummary.dropCount} drop{fuelSummary.dropCount === 1 ? "" : "s"}
                    </div>
                  </>
                )}
              </div>
              <div className="fuel-tachograph-canvas" aria-live="polite">
                <svg
                  ref={fuelChartSvgRef}
                  viewBox={`0 0 ${fuelChartGeometry.width} ${fuelChartGeometry.height}`}
                  className="fuel-tachograph-svg"
                  role="img"
                  aria-label="Fuel level chart for the selected 24-hour activity window"
                  onMouseMove={(event) => updateFuelHoverFromClientX(event.clientX)}
                  onMouseLeave={() => setFuelHoverIndex(null)}
                >
                  <rect x="0" y="0" width={fuelChartGeometry.width} height={fuelChartGeometry.height} fill="#f8fafc" />
                  <defs>
                    <linearGradient id="fuelTrendFillTimelineModal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {fuelChartGeometry.yTicks.map((tick) => (
                    <g key={`fuel-modal-y-${tick.y}`}>
                      <line
                        x1={fuelChartGeometry.left}
                        y1={tick.y}
                        x2={fuelChartGeometry.left + fuelChartGeometry.innerWidth}
                        y2={tick.y}
                        stroke="#cbd5e1"
                        strokeDasharray="3 3"
                      />
                      <text x={fuelChartGeometry.left - 10} y={tick.y + 4} textAnchor="end" fill="#334155" fontSize="11">
                        {tick.liters.toFixed(1)}
                      </text>
                    </g>
                  ))}

                  {fuelChartGeometry.xTicks.map((tick, idx) => (
                    <g key={`fuel-modal-x-${idx}`}>
                      <line
                        x1={tick.x}
                        y1={fuelChartGeometry.top}
                        x2={tick.x}
                        y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                        stroke="#e2e8f0"
                      />
                      <text
                        x={tick.x}
                        y={fuelChartGeometry.top + fuelChartGeometry.innerHeight + 14}
                        textAnchor="middle"
                        fill="#334155"
                        fontSize="10"
                      >
                        {formatFuelChartTime(tick.atMs)}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={fuelChartGeometry.left}
                    y1={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                    x2={fuelChartGeometry.left + fuelChartGeometry.innerWidth}
                    y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                    stroke="#334155"
                    strokeWidth="1.3"
                  />
                  <line
                    x1={fuelChartGeometry.left}
                    y1={fuelChartGeometry.top}
                    x2={fuelChartGeometry.left}
                    y2={fuelChartGeometry.top + fuelChartGeometry.innerHeight}
                    stroke="#334155"
                    strokeWidth="1.3"
                  />

                  <text
                    x={fuelChartGeometry.left + fuelChartGeometry.innerWidth / 2}
                    y={fuelChartGeometry.height - 6}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="600"
                  >
                    Date and time (EAT)
                  </text>
                  <text
                    x="16"
                    y={fuelChartGeometry.top + fuelChartGeometry.innerHeight / 2}
                    transform={`rotate(-90 16 ${fuelChartGeometry.top + fuelChartGeometry.innerHeight / 2})`}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="12"
                    fontWeight="600"
                  >
                    Fuel (L)
                  </text>

                  {fuelChartGeometry.areaPath && (
                    <path d={fuelChartGeometry.areaPath} fill="url(#fuelTrendFillTimelineModal)" stroke="none" />
                  )}
                  {fuelChartGeometry.linePath && (
                    <path
                      d={fuelChartGeometry.linePath}
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
                          fuelChartGeometry.width - 192,
                          Math.max(16, fuelChartGeometry.pointDots[fuelHoverIndex].x + 12)
                        )} ${Math.max(18, fuelChartGeometry.pointDots[fuelHoverIndex].y - 42)})`}
                      >
                        <rect x="0" y="0" width="186" height="36" rx="6" fill="rgba(15, 23, 42, 0.92)" />
                        <text x="8" y="14" fill="#e2e8f0" fontSize="11">
                          {formatFuelChartTime(fuelChartGeometry.pointDots[fuelHoverIndex].atMs)}
                        </text>
                        <text x="8" y="28" fill="#bae6fd" fontSize="11" fontWeight="700">
                          {`Fuel: ${fuelChartGeometry.pointDots[fuelHoverIndex].liters.toFixed(2)} L`}
                        </text>
                      </g>
                    </>
                  )}

                  {fuelChartGeometry.changeDots.map((dot) => (
                    <g key={`fuel-modal-change-${dot.atMs}-${dot.fromLevel}-${dot.toLevel}`}>
                      <line
                        x1={dot.x}
                        y1={dot.yFrom}
                        x2={dot.x}
                        y2={dot.yTo}
                        stroke={dot.rising ? "#16a34a" : "#dc2626"}
                        strokeWidth="2"
                        strokeDasharray="5 4"
                        opacity="0.9"
                      />
                      <circle cx={dot.x} cy={dot.yFrom} r="3.5" fill="#94a3b8" stroke="#ffffff" strokeWidth="1.2" />
                      <circle cx={dot.x} cy={dot.yTo} r="5" fill={dot.rising ? "#16a34a" : "#dc2626"} stroke="#ffffff" strokeWidth="1.4" />
                      <title>
                        {`${dot.rising ? "Refuel" : "Fuel drop"}: ${dot.fromLevel.toFixed(1)} L → ${dot.toLevel.toFixed(1)} L (${dot.deltaLiters > 0 ? "+" : ""}${dot.deltaLiters.toFixed(1)} L) at ${formatFuelChartTime(dot.atMs)}`}
                      </title>
                    </g>
                  ))}
                </svg>

                {timelineLoading && <div className="fuel-tachograph-hint">Loading fuel data...</div>}
                {!timelineLoading && fuelChartGeometry.points.length === 0 && (
                  <div className="fuel-tachograph-hint">No fuel level readings found in this 24-hour window.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotifications && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(30,41,59,0.18)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ background: '#fff', borderRadius: 16, minWidth: 600, maxWidth: '90vw', padding: 24, boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <div style={{
              fontWeight: 700,
              fontSize: 20,
              marginBottom: 16,
              color: '#111827',
              textAlign: 'left',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderBottomLeftRadius: 0,
              background: 'transparent',
              padding: '0 0 0 0',
            }}>
              Select Notifications
            </div>
            <input
              placeholder="Filter notifications"
              style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              value={notificationFilter}
              onChange={e => setNotificationFilter(e.target.value)}
            />
            <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 18 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6' }}>
                    <th style={{ textAlign: 'left', padding: 8, fontWeight: 600 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          checked={filteredNotifications.length > 0 && filteredNotifications.every(n => selectedNotifications.includes(n.id))}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedNotifications(sel => Array.from(new Set([...sel, ...filteredNotifications.map(n => n.id)])));
                            } else {
                              setSelectedNotifications(sel => sel.filter(id => !filteredNotifications.some(n => n.id === id)));
                            }
                          }}
                          style={{ marginRight: 6 }}
                        />
                        Notification name
                      </label>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotifications.map(n => (
                    <tr key={n.id}>
                      <td style={{ padding: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={selectedNotifications.includes(n.id)}
                            onChange={e => {
                              setSelectedNotifications(sel =>
                                e.target.checked
                                  ? [...sel, n.id]
                                  : sel.filter(id => id !== n.id)
                              );
                            }}
                          />
                          {n.name}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowNotifications(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => setShowNotifications(false)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700 }}>Select Notifications</button>
            </div>
          </div>
        </div>
      )}

      <section className="trip-stage">
            <div className="trip-timeline">
              <div className="trip-timeline-track">
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Previous"
                  onClick={() => setTimelineOffsetHours(offset => offset - 1)}
                  style={{ zIndex: 2 }}
                >
                  ◀
                </button>
                <div className="trip-timeline-grid">
                  <div className="trip-timeline-hscroll">
                  <div
                    className="trip-timeline-stack"
                    style={{ ["--trip-named-label-space" as string]: specialMarkerPcts.length ? "calc(1.2em + 1mm)" : "0px" }}
                  >
                    <div className="trip-timeline-track-column trip-timeline-track-column--overlay" ref={timelineRef}>
                      {specialMarkerPcts.map(({ pct, label }) => (
                        <div
                          key={`${label}-${pct.toFixed(2)}`}
                          className="trip-timeline-special-marker"
                          style={{ left: `${pct}%` }}
                          aria-label={label}
                        />
                      ))}
                      {showQueryLine && (
                        <div
                          className="trip-query-line"
                          style={{ left: `${queryLinePct}%` }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setDraggingQueryLine(true);
                          }}
                          role="slider"
                          aria-valuenow={Math.round(queryLinePct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuetext={queryLabel || undefined}
                          aria-label="Query line"
                          title={queryLabel || "Query line"}
                        >
                          <span className="trip-query-label">{queryLabel || "—"}</span>
                          <span className="trip-query-handle" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="trip-timeline-canvas trip-timeline-canvas--fixed">
                      <div className="trip-timeline-row">
                        <div className="trip-timeline-axis">
                          <div className="trip-timeline-scale">
                            {specialMarkerPcts.length > 0 && (
                              <div className="trip-timeline-named-labels">
                                {specialMarkerPcts.map(({ pct, label }) => (
                                  <span
                                    key={`special-${label}-${pct.toFixed(2)}`}
                                    className={`trip-timeline-special-marker-label${pct <= 8 ? " is-start" : pct >= 92 ? " is-end" : ""}`}
                                    style={{ left: `${pct}%` }}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="trip-timeline-labels">
                              {scaleLabels.map(({ label, pct }, index) => (
                                <span
                                  key={`${label}-${index}`}
                                  className="trip-timeline-label-tick"
                                  style={{ left: `${pct}%` }}
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="trip-timeline-ruler" aria-hidden="true">
                            {renderTimelineRuler("top")}
                          </div>
                        </div>
                      </div>

                      <div className="trip-timeline-row trip-timeline-row--primary">
                        <div className="trip-timeline-bar trip-timeline-bar--trips">
                          {timelineWindow && trips.map((trip, i) => {
                            const tripStart = new Date(trip.start).getTime();
                            const tripEnd = new Date(trip.end).getTime();
                            const { windowStart, windowEnd } = timelineWindow;
                            // Overlap with window (same rule as visibleTrips / Historical Tracking).
                            if (!(tripEnd > windowStart && tripStart < windowEnd)) return null;
                            const clampedStart = Math.max(tripStart, windowStart);
                            const clampedEnd = Math.min(tripEnd, windowEnd);
                            const leftPct = ((clampedStart - windowStart) / (windowEnd - windowStart)) * 100;
                            const widthPct = ((clampedEnd - clampedStart) / (windowEnd - windowStart)) * 100;
                            const tripId = `${trip.start}-${trip.end}-${i}`;
                            return (
                              <TripBlock
                                key={tripId}
                                trip={{ ...trip, left: `${leftPct}%`, width: `${widthPct}%` }}
                                isOpen={openTripId === tripId}
                                onToggle={() => setOpenTripId((current) => (current === tripId ? null : tripId))}
                                onClose={() => setOpenTripId((current) => (current === tripId ? null : current))}
                              />
                            );
                          })}
                          {timelineWindow && hasSelection && !timelineLoading && visibleTrips.length === 0 && !timelineError && (
                            <div className="trip-empty-results">No trips available for this asset in the selected window.</div>
                          )}
                          {timelineWindow && hasSelection && !timelineLoading && timelineError && (
                            <div className="trip-empty-results">{timelineError}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="trip-notifications-scroll">
                      <div className="trip-timeline-canvas">
                        {visibleTimelineRows.map((row: TimelineRowDefinition) => {
                          if (!timelineWindow) return null;
                          const rowEvents = eventsByRowKey.get(row.key) ?? [];
                          const continuousSpans = row.renderMode === "continuous"
                            ? (continuousSpansByRow.get(row.key) ?? [])
                            : [];

                          return (
                            <div className="trip-timeline-row" key={row.key}>
                              <div className="trip-timeline-bar trip-timeline-bar--labeled trip-timeline-bar--events">
                                <span className="trip-timeline-inline-label" title={row.label}>{row.label}</span>
                                {row.renderMode === "continuous"
                                  ? continuousSpans.map((span, index) => (
                                    <TimelineEventBar
                                      key={`${row.key}-span-${span.startMs}-${index}`}
                                      span={span}
                                      rowKey={row.key}
                                      notifName={notifications.find((n) => n.id === span.event.id)?.name ?? row.label}
                                    />
                                  ))
                                  : rowEvents.map((event, index) => (
                                    <TimelineEventMarker
                                      key={`${row.key}-${event.at}-${index}`}
                                      event={event}
                                      notifName={notifications.find((n) => n.id === event.id)?.name ?? row.label}
                                      variant={row.markerVariant}
                                      leftPct={eventLeftPercentInWindow(event.at, timelineWindow.windowStart, timelineWindow.windowEnd)}
                                    />
                                  ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {showQueryLine && (queryHitsByRow.size > 0 || tripQueryHit) && (
                      <div
                        className="trip-query-leaflet-slot"
                        aria-live="polite"
                        style={{ ["--trip-query-pct" as string]: String(queryLinePct) }}
                      >
                        <div
                          className={`trip-query-inspector trip-query-inspector--below${queryLinePct >= 72 ? " is-end" : queryLinePct <= 28 ? " is-start" : ""}`}
                          role="status"
                        >
                          <div className="trip-query-inspector-title">{queryLabel || "Query line"}</div>
                          {tripQueryHit && querySnapshot?.trip ? (
                            <div className="trip-query-inspector-event">
                              <strong>Trip</strong>
                              <div>{normalizeDriverName(querySnapshot.trip.driver)}</div>
                              <div>{formatEventDateTime(querySnapshot.trip.start)} → {formatEventDateTime(querySnapshot.trip.end)}</div>
                              <div>{querySnapshot.trip.duration} · {querySnapshot.trip.distance}</div>
                            </div>
                          ) : null}
                          {Array.from(queryHitsByRow.entries()).map(([rowKey, hit]) => (
                            <div className="trip-query-inspector-event" key={`query-hit-${rowKey}`}>
                              <strong>{hit.notifName}</strong>
                              <div>{formatEventDateTime(hit.startAt)}{hit.endAt ? ` → ${formatEventDateTime(hit.endAt)}` : ""}</div>
                              <div>Value: {hit.eventValue ?? "0"}{hit.location ? ` · ${hit.location}` : ""}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="trip-timeline-canvas trip-timeline-canvas--fixed">
                      <div className="trip-timeline-row">
                        <div className="trip-timeline-ruler" aria-hidden="true">
                          {renderTimelineRuler("bottom")}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
                <button
                  className="trip-timeline-arrow"
                  type="button"
                  aria-label="Next"
                  onClick={() => setTimelineOffsetHours(offset => offset + 1)}
                  style={{ zIndex: 2 }}
                >
                  ▶
                </button>
              </div>

              <div className="trip-timeline-footer">
                <div className="trip-mini-bar" aria-hidden="true">
                  {timelineWindow && visibleTrips.map((trip, index) => {
                    const tripStart = new Date(trip.start).getTime();
                    const tripEnd = new Date(trip.end).getTime();
                    const { windowStart, windowEnd } = timelineWindow;
                    const clampedStart = Math.max(tripStart, windowStart);
                    const clampedEnd = Math.min(tripEnd, windowEnd);
                    const leftPct = ((clampedStart - windowStart) / (windowEnd - windowStart)) * 100;
                    const widthPct = ((clampedEnd - clampedStart) / (windowEnd - windowStart)) * 100;
                    return (
                      <span
                        key={`mini-${index}`}
                        className={`trip-mini-block ${tripHasDriver(trip.driver) ? "trip-mini-block--has-driver" : "trip-mini-block--no-driver"}`}
                        style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.4)}%` }}
                      />
                    );
                  })}
                  {showQueryLine && (
                    <span className="trip-mini-query" style={{ left: `${queryLinePct}%` }} />
                  )}
                </div>
                <div className="trip-mini-axis">
                  {scaleLabels.map(({ label, pct }, index) => (
                    <span key={`mini-axis-${label}-${index}`} style={{ left: `${pct}%` }}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
      </section>
    </div>
  );
}

function continuousSpanVariant(rowKey: TimelineRowKey): string {
  if (rowKey === "green-band") return "green-band";
  if (rowKey === "idle-excessive") return "idle";
  if (rowKey === "over-rev") return "over-rev";
  return "continuous";
}

function TimelineEventBar({
  span,
  rowKey,
  notifName
}: {
  span: TimelineEventSpan;
  rowKey: TimelineRowKey;
  notifName: string;
}) {
  const spanVariant = continuousSpanVariant(rowKey);
  return (
    <span
      className={`trip-notification-span trip-notification-span--${spanVariant}`}
      style={{ left: `${span.leftPct}%`, width: `${span.widthPct}%` }}
      aria-label={`${notifName} from ${formatEventDateTime(new Date(span.startMs).toISOString())} to ${formatEventDateTime(new Date(span.endMs).toISOString())}`}
    />
  );
}

function TimelineEventMarker({
  event,
  notifName,
  variant,
  leftPct
}: {
  event: NotificationEvent;
  notifName: string;
  variant: TimelineRowDefinition["markerVariant"];
  leftPct: number | null;
}) {
  if (leftPct === null) return null;
  return (
    <span
      className={`trip-notification-marker trip-notification-marker--${variant}`}
      style={{ left: `${leftPct}%` }}
      aria-label={`${notifName} at ${formatEventDateTime(event.at)}`}
    />
  );
}

// TripBlock component for rich tooltip (must be after export default)
function TripBlock({
  trip,
  isOpen,
  onToggle,
  onClose
}: {
  trip: any;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const blockRef = React.useRef<HTMLSpanElement | null>(null);
  const [popupStyle, setPopupStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    if (!isOpen || !blockRef.current) return;
    const rect = blockRef.current.getBoundingClientRect();
    const popupWidth = 280;
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
    setPopupStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left,
      width: popupWidth,
      zIndex: 9999,
    });
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (blockRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [isOpen, onClose]);

  const tripStart = new Date(trip.start).getTime();
  const tripEnd = new Date(trip.end).getTime();
  const tripDuration = Math.max(tripEnd - tripStart, 1);

  const formatEAT = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const datePart = d.toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", day: "2-digit", month: "2-digit", year: "numeric" });
      const timePart = d.toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: false });
      return `${datePart} ${timePart} (EAT)`;
    } catch {
      return dateStr;
    }
  };

  const hasDriver = tripHasDriver(trip.driver);

  const popup = isOpen ? ReactDOM.createPortal(
    <div className="trip-tooltip-rich" style={popupStyle}>
      <div className="trip-tooltip-driver">{normalizeDriverName(trip.driver)}</div>
      <div><span className="trip-tooltip-label">Start date:</span>{formatEAT(trip.start)}</div>
      <div><span className="trip-tooltip-label">End date:</span>{formatEAT(trip.end)}</div>
      <div><span className="trip-tooltip-label">Duration:</span>{trip.duration}</div>
      <div><span className="trip-tooltip-label">Distance:</span>{trip.distance}</div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span
        ref={blockRef}
        className={`trip-trip-block trip-unity-trip ${hasDriver ? "trip-unity-trip--has-driver" : "trip-unity-trip--no-driver"}`}
        style={{ left: trip.left, width: trip.width, zIndex: isOpen ? 10 : undefined }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        aria-label="Show trip details"
      >
        {Array.isArray(trip.segments) && trip.segments
          .filter((segment: any) => segment.type === "moving")
          .map((segment: any, index: number) => {
            const segStart = new Date(segment.start).getTime();
            const segEnd = new Date(segment.end).getTime();
            const clampedStart = Math.max(segStart, tripStart);
            const clampedEnd = Math.min(segEnd, tripEnd);
            if (clampedEnd <= clampedStart) return null;
            const leftPct = ((clampedStart - tripStart) / tripDuration) * 100;
            const widthPct = ((clampedEnd - clampedStart) / tripDuration) * 100;
            return (
              <span
                key={`move-${index}`}
                className="trip-trip-seg trip-trip-seg--moving"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              />
            );
          })}
      </span>
      {popup}
    </>
  );
}
