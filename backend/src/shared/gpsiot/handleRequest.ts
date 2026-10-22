import {
  createGpsIotAsset,
  fetchGpsIotClientFleet,
  getGpsIotAssetByCustomId,
  getGpsIotAssetByName,
  normalizeCreateAssetInput,
  saveGpsIotAssetDetails
} from "./assets.ts";
import { GpsIotClientError, fetchGpsIotClients, matchClientsToDatabases, matchClientsToSites, type GpsIotDatabaseRef } from "./clients.ts";
import { decommissionGpsIotDevice, saveGpsIotDevice } from "./devices.ts";
import { deleteGpsIotDriver, saveGpsIotDriver } from "./drivers.ts";
import { fetchGpsIotCanBus } from "./canbus.ts";
import {
  fetchGpsIotClientAlerts,
  fetchGpsIotEventCatalog,
  fetchGpsIotEventTelemetryRange,
  fetchGpsIotNotificationAlerts,
  matchGpsIotEventToDescription
} from "./events.ts";
import { fetchGpsIotCurrentFuelReading, fetchGpsIotFuelInfo, fetchGpsIotFuelTelemetry, fetchGpsIotLiveDevices, fuelTelemetryToFuelInfo, mergeGpsIotFuelInfo, type GpsIotFuelInfo, type GpsIotLiveDevice } from "./fleet.ts";
import {
  fetchGpsIotClientAssetsInputStatus,
  findGpsIotAssetInputStatus
} from "./inputStatus.ts";
import {
  assignGpsIotForwardDevices,
  deleteGpsIotForwardProvider,
  ensureGpsIotLiveForwarding,
  listGpsIotForwardProviders,
  mergeGpsIotLiveDevices,
  saveGpsIotForwardProvider,
  updateGpsIotForwardProvider
} from "./forwarding.ts";
import {
  deleteGpsIotGeofence,
  listGpsIotGeofencesByClient,
  saveGpsIotGeofence
} from "./geofences.ts";
import { readGpsIotSecrets, type GpsIotEnv } from "./secrets.ts";
import { getGpsIotAccessToken } from "./token.ts";
import {
  fetchGpsIotClientMileage,
  fetchGpsIotDailySummary,
  fetchGpsIotDeviceTrips,
  fetchGpsIotMileageTrips,
  fetchGpsIotMovementSummary,
  gpsIotDeviceIdFromImei,
  tripsToRoutePoints,
  type GpsIotMappedTrip
} from "./trips.ts";

export type GpsIotLiveCache = {
  read?: (tenantId: string) => Promise<GpsIotLiveDevice[]>;
};

export type GpsIotRequest = {
  region: string;
  method: string;
  pathname: string;
  env: GpsIotEnv;
  databases: GpsIotDatabaseRef[];
  body?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  /** Optional forwarded-live cache merge for /gpsiot/live (hybrid Live Tracking). */
  liveCache?: GpsIotLiveCache;
  tenantId?: string;
};

async function resolveClientId(
  body: Record<string, unknown>,
  secrets: NonNullable<ReturnType<typeof readGpsIotSecrets>>,
  accessToken: string,
  databases: GpsIotDatabaseRef[],
  fetchImpl: typeof fetch
) {
  let clientId = String(body.clientId ?? body.ClientID ?? body.ClientId ?? "").trim();
  const databaseName = String(body.databaseName ?? body.database ?? "").trim();
  if (!clientId && databaseName) {
    const clients = await fetchGpsIotClients(secrets, accessToken, fetchImpl);
    const mapped = matchClientsToDatabases(clients, databases);
    const hit = mapped.databases.find(
      (row) => row.matched && row.name.trim().toLowerCase() === databaseName.toLowerCase()
    );
    clientId = String(hit?.clientId ?? "").trim();
  }
  return clientId;
}

/**
 * Geofences / locations are site-owned (GPS IoT ClientID = Vivitel site).
 * Never fall back to database-name client matching — that would mix sites.
 */
async function resolveSiteClientId(
  body: Record<string, unknown>,
  secrets: NonNullable<ReturnType<typeof readGpsIotSecrets>>,
  accessToken: string,
  fetchImpl: typeof fetch
) {
  let clientId = String(body.clientId ?? body.ClientID ?? body.ClientId ?? "").trim();
  if (clientId) return clientId;
  const site = String(body.site ?? body.siteName ?? body.vCompanyName ?? "").trim();
  if (!site) return "";
  const clients = await fetchGpsIotClients(secrets, accessToken, fetchImpl);
  const mapped = matchClientsToSites(clients, [{
    id: site,
    name: site,
    dealerName: "",
    organisationName: "",
    databaseId: "",
    databaseName: ""
  }]);
  return String(mapped.sites[0]?.clientId ?? "").trim();
}

async function resolveImei(
  body: Record<string, unknown>,
  secrets: NonNullable<ReturnType<typeof readGpsIotSecrets>>,
  accessToken: string,
  fetchImpl: typeof fetch
) {
  const direct = String(body.imei ?? body.ImeiNumber ?? body.Imei ?? "").trim();
  if (direct) return { imei: direct, deviceName: String(body.deviceName ?? "").trim() };
  const deviceId = String(body.deviceId ?? body.DeviceId ?? "").trim();
  if (!deviceId) return { imei: "", deviceName: "" };
  const devices = await fetchGpsIotLiveDevices(secrets, accessToken, fetchImpl);
  const match = devices.find(
    (device) => device.imei === deviceId || String(gpsIotDeviceIdFromImei(device.imei)) === deviceId
  );
  return { imei: String(match?.imei ?? "").trim(), deviceName: String(match?.name ?? "").trim() };
}

function toTraccarTrip(trip: GpsIotMappedTrip) {
  return {
    deviceId: trip.deviceId,
    deviceName: trip.deviceName,
    maxSpeed: trip.maxSpeed,
    averageSpeed: trip.averageSpeed,
    distance: trip.distance,
    duration: trip.duration,
    startTime: trip.startTime,
    startAddress: trip.startAddress,
    startLat: trip.startLat,
    startLon: trip.startLon,
    endTime: trip.endTime,
    endAddress: trip.endAddress,
    endLat: trip.endLat,
    endLon: trip.endLon,
    driverUniqueId: trip.driverUniqueId,
    driverName: trip.driverName
  };
}

function toTraccarStop(trip: GpsIotMappedTrip) {
  return {
    deviceId: trip.deviceId,
    deviceName: trip.deviceName,
    duration: trip.duration,
    startTime: trip.startTime,
    startAddress: trip.startAddress,
    startLat: trip.startLat,
    startLon: trip.startLon,
    endTime: trip.endTime,
    endAddress: trip.endAddress,
    endLat: trip.endLat,
    endLon: trip.endLon,
    distance: trip.distance,
    averageSpeed: trip.averageSpeed,
    maxSpeed: trip.maxSpeed
  };
}

function summarizeTrips(trips: GpsIotMappedTrip[]) {
  const moving = trips.filter((trip) => !trip.isStoppage);
  const source = moving.length ? moving : trips;
  if (!source.length) return [];
  const first = source[0]!;
  const distance = source.reduce((sum, trip) => sum + trip.distance, 0);
  const duration = source.reduce((sum, trip) => sum + trip.duration, 0);
  const maxSpeed = source.reduce((max, trip) => Math.max(max, trip.maxSpeed), 0);
  const durationHours = duration > 0 ? duration / 3_600_000 : 0;
  return [{
    deviceId: first.deviceId,
    deviceName: first.deviceName,
    maxSpeed,
    averageSpeed: durationHours > 0 ? (distance / 1000) / durationHours : 0,
    distance,
    spentFuel: 0,
    engineHours: durationHours
  }];
}

export async function handleGpsIotRequest(input: GpsIotRequest): Promise<{ status: number; body: Record<string, unknown> }> {
  const region = String(input.region ?? "").trim().toLowerCase();
  const path = String(input.pathname ?? "").replace(/\/+$/, "") || "/gpsiot";
  const method = String(input.method ?? "GET").trim().toUpperCase();
  if (region !== "uk") {
    return { status: 404, body: { error: "GPS IoT is only available on the United Kingdom server" } };
  }
  const known =
    (method === "GET" && (
      path === "/gpsiot/databases"
      || path === "/gpsiot/clients"
      || path === "/gpsiot/live"
      || path === "/gpsiot/forwarding/providers"
    ))
    || (method === "POST" && (
      path === "/gpsiot/fuel"
      || path === "/gpsiot/fuel/current"
      || path === "/gpsiot/fuel/telemetry"
      || path === "/gpsiot/canbus"
      || path === "/gpsiot/input-status"
      || path === "/gpsiot/events"
      || path === "/gpsiot/events/telemetry"
      || path === "/gpsiot/alerts"
      || path === "/gpsiot/alerts/notifications"
      || path === "/gpsiot/assets"
      || path === "/gpsiot/assets/list"
      || path === "/gpsiot/assets/save"
      || path === "/gpsiot/assets/by-custom-id"
      || path === "/gpsiot/assets/by-name"
      || path === "/gpsiot/devices/save"
      || path === "/gpsiot/devices/decommission"
      || path === "/gpsiot/drivers/save"
      || path === "/gpsiot/trips"
      || path === "/gpsiot/trips/route"
      || path === "/gpsiot/trips/stops"
      || path === "/gpsiot/trips/summary"
      || path === "/gpsiot/mileage"
      || path === "/gpsiot/daily-summary"
      || path === "/gpsiot/geofences/list"
      || path === "/gpsiot/geofences/save"
      || path === "/gpsiot/geofences/delete"
      || path === "/gpsiot/forwarding/providers/save"
      || path === "/gpsiot/forwarding/providers/update"
      || path === "/gpsiot/forwarding/providers/assign"
      || path === "/gpsiot/forwarding/ensure"
    ))
    || (method === "PUT" && path === "/gpsiot/assets")
    || (method === "DELETE" && (
      path === "/gpsiot/drivers"
      || path === "/gpsiot/forwarding/providers"
    ));
  if (!known) {
    return { status: 404, body: { error: "Unknown GPS IoT route" } };
  }

  const secrets = readGpsIotSecrets(region, input.env);
  if (!secrets) {
    return {
      status: 503,
      body: {
        ok: false,
        error: "United Kingdom GPS IoT keys are not set",
        databases: input.databases.map((database) => ({
          ...database,
          matched: false,
          ambiguous: false,
          clientId: "",
          vCompanyName: ""
        })),
        unmatchedClients: []
      }
    };
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const accessToken = await getGpsIotAccessToken(secrets, fetchImpl);
    const body = input.body ?? {};
    if (path === "/gpsiot/live") {
      const devices = await fetchGpsIotLiveDevices(secrets, accessToken, fetchImpl);
      const tenantId = String(input.tenantId ?? "").trim();
      const cached = tenantId && input.liveCache?.read
        ? await input.liveCache.read(tenantId).catch(() => [] as GpsIotLiveDevice[])
        : [];
      // Hybrid: forwarded Common JSON overlays REST snapshot for Live Tracking freshness.
      const merged = mergeGpsIotLiveDevices(devices, cached);
      return {
        status: 200,
        body: {
          ok: true,
          devices: merged,
          source: cached.length ? "forward+api" : "api",
          forwarded: cached.length,
          api: devices.length
        }
      };
    }
    if (path === "/gpsiot/forwarding/providers" && method === "GET") {
      const providers = await listGpsIotForwardProviders(secrets, accessToken, fetchImpl);
      return { status: 200, body: { ok: true, providers } };
    }
    if (path === "/gpsiot/forwarding/providers/save") {
      const saved = await saveGpsIotForwardProvider(secrets, accessToken, body, fetchImpl);
      return { status: 200, body: { ok: true, ...saved } };
    }
    if (path === "/gpsiot/forwarding/providers/update") {
      const saved = await updateGpsIotForwardProvider(secrets, accessToken, body, fetchImpl);
      return { status: 200, body: { ok: true, ...saved } };
    }
    if (path === "/gpsiot/forwarding/providers" && method === "DELETE") {
      const providerId = body.ProviderID ?? body.providerId ?? body.id;
      const deleted = await deleteGpsIotForwardProvider(secrets, accessToken, providerId as string | number, fetchImpl);
      return { status: 200, body: { ok: true, ...deleted } };
    }
    if (path === "/gpsiot/forwarding/providers/assign") {
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or site is required for forwarding assignment" } };
      }
      const assigned = await assignGpsIotForwardDevices(
        secrets,
        accessToken,
        { ...body, clientId },
        fetchImpl
      );
      return { status: 200, body: { ok: true, ...assigned, clientId } };
    }
    if (path === "/gpsiot/forwarding/ensure") {
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      const ingestUrl = String(body.ingestUrl ?? body.url ?? body.URL ?? "").trim();
      const token = String(body.token ?? body.Token ?? input.env.GPSIOT_FORWARD_TOKEN ?? "").trim();
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or site is required" } };
      }
      if (!ingestUrl) {
        return { status: 400, body: { ok: false, error: "ingestUrl is required (public /ingest/gpsiot URL)" } };
      }
      if (!token) {
        return { status: 400, body: { ok: false, error: "token or GPSIOT_FORWARD_TOKEN is required" } };
      }
      const ensured = await ensureGpsIotLiveForwarding(
        secrets,
        accessToken,
        {
          clientId,
          site: String(body.site ?? "").trim(),
          ingestUrl,
          token,
          providerName: String(body.providerName ?? body.ProviderName ?? "").trim() || undefined
        },
        fetchImpl
      );
      return { status: 200, body: { ok: true, ...ensured, clientId } };
    }
    if (path === "/gpsiot/fuel") {
      const assetId = String(body.assetId ?? body.AssetId ?? "").trim();
      const startDate = String(body.startDate ?? body.start_date ?? body.from ?? "").trim();
      const endDate = String(body.endDate ?? body.end_date ?? body.to ?? "").trim();
      const rawImeiArray = body.imeiArray ?? body.imei_array;
      const imeiArray = Array.isArray(rawImeiArray)
        ? rawImeiArray.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
        : String(body.imei ?? body.Imei ?? body.ImeiNumber ?? "").trim()
          ? [String(body.imei ?? body.Imei ?? body.ImeiNumber).trim()]
          : [];

      let assetInfo: GpsIotFuelInfo | null = null;
      if (assetId) {
        try {
          assetInfo = await fetchGpsIotFuelInfo(secrets, accessToken, {
            assetId,
            startDate,
            endDate,
            timeZoneId: String(body.timeZoneId ?? body.TimeZoneID ?? "UTC")
          }, fetchImpl);
        } catch {
          assetInfo = null;
        }
      }

      let telemetryInfo: GpsIotFuelInfo | null = null;
      let telemetryRows: Awaited<ReturnType<typeof fetchGpsIotFuelTelemetry>> = [];
      if (imeiArray.length && startDate && endDate) {
        try {
          telemetryRows = await fetchGpsIotFuelTelemetry(secrets, accessToken, {
            startDate,
            endDate,
            imeiArray
          }, fetchImpl);
          const wanted = new Set(imeiArray.map((imei) => imei.toLowerCase()));
          const match = telemetryRows.find((row) => wanted.has(String(row.imei ?? "").toLowerCase()))
            ?? telemetryRows[0]
            ?? null;
          telemetryInfo = match ? fuelTelemetryToFuelInfo(match) : null;
        } catch {
          telemetryInfo = null;
        }
      }

      if (!assetInfo && !telemetryInfo) {
        if (!assetId && !imeiArray.length) {
          return { status: 400, body: { ok: false, error: "assetId or imei is required" } };
        }
        return { status: 502, body: { ok: false, error: "GPS IoT fuel data unavailable" } };
      }

      const fuel = mergeGpsIotFuelInfo(assetInfo, telemetryInfo);
      return {
        status: 200,
        body: {
          ok: true,
          ...fuel,
          refills: fuel.refills,
          telemetry: telemetryRows,
          source: assetInfo && telemetryInfo ? "assetfuelinfo+fueltelemetry" : telemetryInfo ? "fueltelemetry" : "assetfuelinfo"
        }
      };
    }
    if (path === "/gpsiot/fuel/telemetry") {
      const startDate = String(body.startDate ?? body.start_date ?? body.from ?? "").trim();
      const endDate = String(body.endDate ?? body.end_date ?? body.to ?? "").trim();
      const rawImeiArray = body.imeiArray ?? body.imei_array;
      const imeiArray = Array.isArray(rawImeiArray)
        ? rawImeiArray.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
        : String(body.imei ?? body.Imei ?? "").trim()
          ? [String(body.imei ?? body.Imei).trim()]
          : [];
      if (!startDate || !endDate) {
        return { status: 400, body: { ok: false, error: "start_date and end_date are required" } };
      }
      const rows = await fetchGpsIotFuelTelemetry(secrets, accessToken, {
        startDate,
        endDate,
        imeiArray
      }, fetchImpl);
      return { status: 200, body: { ok: true, data: rows, telemetry: rows } };
    }
    if (path === "/gpsiot/fuel/current") {
      const readings = await fetchGpsIotCurrentFuelReading(secrets, accessToken, {
        assetId: String(body.assetId ?? body.AssetId ?? "")
      }, fetchImpl);
      const fuelLevel = readings.reduce((max, row) => Math.max(max, row.fuelLevel), Number.NEGATIVE_INFINITY);
      return {
        status: 200,
        body: {
          ok: true,
          readings,
          fuelLevel: Number.isFinite(fuelLevel) ? fuelLevel : null
        }
      };
    }
    if (path === "/gpsiot/canbus") {
      const canbus = await fetchGpsIotCanBus(secrets, accessToken, {
        assetId: String(body.assetId ?? body.AssetId ?? "")
      }, fetchImpl);
      return { status: 200, body: { ok: true, ...canbus } };
    }
    if (path === "/gpsiot/input-status") {
      // Prefer site ClientID so Input Status never mixes databases/sites.
      let clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      }
      const rows = await fetchGpsIotClientAssetsInputStatus(
        secrets,
        accessToken,
        { clientId: clientId || undefined },
        fetchImpl
      );
      const assetId = String(body.assetId ?? body.AssetId ?? "").trim();
      const imei = String(body.imei ?? body.Imei ?? body.ImeiNumber ?? "").trim();
      const name = String(body.assetName ?? body.name ?? body.Name ?? "").trim();
      const registration = String(body.registration ?? body.Registration ?? "").trim();
      const match = (assetId || imei || name || registration)
        ? findGpsIotAssetInputStatus(rows, { assetId, imei, name, registration })
        : null;
      return {
        status: 200,
        body: {
          ok: true,
          assets: rows,
          asset: match,
          inputs: match?.inputs ?? [],
          attributes: match?.attributes ?? {}
        }
      };
    }
    if (path === "/gpsiot/events") {
      const events = await fetchGpsIotEventCatalog(secrets, accessToken, fetchImpl);
      return { status: 200, body: { ok: true, events } };
    }
    if (path === "/gpsiot/events/telemetry") {
      const rawEventIds = body.events ?? body.Events;
      const eventIds = Array.isArray(rawEventIds)
        ? rawEventIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
        : String(body.eventId ?? "").trim()
          ? [String(body.eventId).trim()]
          : [];
      // Resolve monitored Vivitel descriptions → GPS IoT event ids when callers pass names.
      let resolvedIds = eventIds;
      if (Array.isArray(body.eventNames) && body.eventNames.length) {
        const catalog = await fetchGpsIotEventCatalog(secrets, accessToken, fetchImpl);
        const fromNames = (body.eventNames as unknown[])
          .map((name) => matchGpsIotEventToDescription(catalog, String(name ?? "")))
          .filter(Boolean)
          .map((row) => row!.id);
        resolvedIds = Array.from(new Set([...resolvedIds, ...fromNames]));
      }
      const rows = await fetchGpsIotEventTelemetryRange(secrets, accessToken, {
        assetId: String(body.assetId ?? body.AssetId ?? ""),
        startTime: String(body.startTime ?? body.StartTime ?? body.from ?? ""),
        endTime: String(body.endTime ?? body.EndTime ?? body.to ?? ""),
        events: resolvedIds,
        timeZone: String(body.timeZone ?? body.TimeZone ?? "UTC")
      }, fetchImpl);
      return { status: 200, body: { ok: true, events: rows, telemetry: rows } };
    }
    if (path === "/gpsiot/alerts") {
      // Site-owned ClientID only — never database-name fallback (alerts must not cross sites).
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "site ClientID is required (site-scoped alerts)" } };
      }
      const alerts = await fetchGpsIotClientAlerts(secrets, accessToken, clientId, fetchImpl);
      return { status: 200, body: { ok: true, alerts } };
    }
    if (path === "/gpsiot/alerts/notifications") {
      // GetNotificationAlerts is site-scoped (GPS IoT ClientID = Vivitel site).
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "site ClientID is required (site-scoped alerts)" } };
      }
      const rawAlertIds = body.alertIds ?? body.AlertIds;
      const alerts = await fetchGpsIotNotificationAlerts(secrets, accessToken, {
        clientId,
        startDate: String(body.startDate ?? body.StartDate ?? body.from ?? ""),
        endDate: String(body.endDate ?? body.EndDate ?? body.to ?? ""),
        timeZoneId: String(body.timeZoneId ?? body.TimeZoneID ?? "UTC"),
        alertIds: Array.isArray(rawAlertIds)
          ? rawAlertIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
          : undefined,
        notifyUserId: String(body.notifyUserId ?? body.NotifyUserId ?? "") || undefined
      }, fetchImpl);
      return { status: 200, body: { ok: true, alerts, notifications: alerts } };
    }
    if (
      path === "/gpsiot/trips"
      || path === "/gpsiot/trips/route"
      || path === "/gpsiot/trips/stops"
      || path === "/gpsiot/trips/summary"
    ) {
      const startTime = String(body.startTime ?? body.from ?? body.StartTime ?? "").trim();
      const endTime = String(body.endTime ?? body.to ?? body.EndTime ?? "").trim();
      if (!startTime || !endTime) {
        return { status: 400, body: { ok: false, error: "startTime and endTime are required" } };
      }
      const resolved = await resolveImei(body, secrets, accessToken, fetchImpl);
      if (!resolved.imei) {
        return { status: 400, body: { ok: false, error: "imei or a matched deviceId is required" } };
      }
      const range = {
        imei: resolved.imei,
        startTime,
        endTime,
        timeZone: String(body.timeZone ?? body.TimeZone ?? "UTC"),
        deviceName: resolved.deviceName || String(body.deviceName ?? "")
      };
      // Breadcrumb trail stays on MileageSummary (start/second points).
      if (path === "/gpsiot/trips/route") {
        const segments = await fetchGpsIotMileageTrips(secrets, accessToken, range, fetchImpl);
        return { status: 200, body: { ok: true, positions: tripsToRoutePoints(segments) } };
      }
      // Summary Movement / Daily Movement summary → GetDailySummary + ClientAssetsMileage.
      if (path === "/gpsiot/trips/summary") {
        const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
        const summary = await fetchGpsIotMovementSummary(
          secrets,
          accessToken,
          {
            ...range,
            clientId,
            registration: String(body.registration ?? body.RegNo ?? body.regNo ?? "").trim()
          },
          fetchImpl
        );
        return { status: 200, body: { ok: true, summary } };
      }
      // Detailed / Daily Movement + Trip Timeline: GetTrips → GetTripDetails.
      const trips = await fetchGpsIotDeviceTrips(secrets, accessToken, range, fetchImpl);
      if (path === "/gpsiot/trips") {
        return {
          status: 200,
          body: {
            ok: true,
            trips: trips.filter((trip) => !trip.isStoppage).map(toTraccarTrip),
            segments: trips
          }
        };
      }
      return {
        status: 200,
        body: { ok: true, stops: trips.filter((trip) => trip.isStoppage).map(toTraccarStop) }
      };
    }
    if (path === "/gpsiot/mileage") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const startTime = String(body.startTime ?? body.from ?? body.StartTime ?? "").trim();
      const endTime = String(body.endTime ?? body.to ?? body.EndTime ?? "").trim();
      if (!startTime || !endTime) {
        return { status: 400, body: { ok: false, error: "startTime and endTime are required" } };
      }
      const assetIds = Array.isArray(body.assetIds)
        ? body.assetIds.map((id) => String(id ?? "").trim()).filter(Boolean)
        : String(body.assetId ?? body.AssetId ?? "").trim()
          ? [String(body.assetId ?? body.AssetId ?? "").trim()]
          : undefined;
      const mileage = await fetchGpsIotClientMileage(
        secrets,
        accessToken,
        {
          clientId,
          startTime,
          endTime,
          timeZone: String(body.timeZone ?? body.TimeZone ?? "UTC"),
          assetIds
        },
        fetchImpl
      );
      return { status: 200, body: { ok: true, mileage, clientId } };
    }
    if (path === "/gpsiot/daily-summary") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const summary = await fetchGpsIotDailySummary(
        secrets,
        accessToken,
        {
          clientId,
          startTime: String(body.startTime ?? body.from ?? body.StartTime ?? "").trim() || undefined,
          endTime: String(body.endTime ?? body.to ?? body.EndTime ?? "").trim() || undefined,
          timeZone: String(body.timeZone ?? body.TimeZone ?? "UTC")
        },
        fetchImpl
      );
      return { status: 200, body: { ok: true, summary, clientId } };
    }
    if (path === "/gpsiot/geofences/list") {
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        return {
          status: 400,
          body: { ok: false, error: "clientId or site (GPS IoT ClientID) is required — geofences are site-scoped" }
        };
      }
      const geofences = await listGpsIotGeofencesByClient(secrets, accessToken, clientId, fetchImpl);
      return { status: 200, body: { ok: true, geofences, clientId, site: String(body.site ?? "").trim() } };
    }
    if (path === "/gpsiot/geofences/save") {
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      if (!clientId) {
        return {
          status: 400,
          body: { ok: false, error: "clientId or site (GPS IoT ClientID) is required — geofences are site-scoped" }
        };
      }
      const saved = await saveGpsIotGeofence(secrets, accessToken, { ...body, clientId }, fetchImpl);
      return { status: 200, body: { ok: true, stored: true, ...saved, clientId } };
    }
    if (path === "/gpsiot/geofences/delete") {
      let geoId = String(body.geoId ?? body.GeoID ?? body.GeofenceID ?? body.id ?? "").trim();
      const clientId = await resolveSiteClientId(body, secrets, accessToken, fetchImpl);
      const name = String(body.name ?? body.GeoName ?? "").trim().toLowerCase();
      // Resolve by name within this site's ClientID only — never across clients.
      if (!geoId && clientId && name) {
        const listed = await listGpsIotGeofencesByClient(secrets, accessToken, clientId, fetchImpl).catch(() => []);
        const hit = listed.find((row) => row.name.toLowerCase() === name);
        if (hit?.geoId) geoId = hit.geoId;
      }
      if (!geoId) {
        return { status: 400, body: { ok: false, error: "geoId is required (or a matching name under the site client)" } };
      }
      const result = await deleteGpsIotGeofence(secrets, accessToken, geoId, fetchImpl);
      let extraDeleted = 0;
      if (clientId && name) {
        const listed = await listGpsIotGeofencesByClient(secrets, accessToken, clientId, fetchImpl).catch(() => []);
        for (const row of listed) {
          if (row.geoId === geoId) continue;
          if (row.name.toLowerCase() !== name) continue;
          await deleteGpsIotGeofence(secrets, accessToken, row.geoId, fetchImpl);
          extraDeleted += 1;
        }
      }
      return { status: 200, body: { ok: true, ...result, extraDeleted, clientId } };
    }
    if (path === "/gpsiot/assets" && method === "POST") {
      // Explicit create-only route (no AssetId). Prefer /gpsiot/assets/save for upserts.
      const created = await createGpsIotAsset(secrets, accessToken, normalizeCreateAssetInput(body), fetchImpl);
      return { status: 200, body: { ok: true, created: true, updated: false, ...created } };
    }
    if ((path === "/gpsiot/assets" && method === "PUT") || path === "/gpsiot/assets/save") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const saved = await saveGpsIotAssetDetails(
        secrets,
        accessToken,
        { ...body, clientId },
        fetchImpl
      );
      return { status: 200, body: { ok: true, stored: true, ...saved } };
    }
    if (path === "/gpsiot/assets/list") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const assets = await fetchGpsIotClientFleet(
        secrets,
        accessToken,
        clientId,
        { site: String(body.site ?? "").trim() },
        fetchImpl
      );
      return { status: 200, body: { ok: true, assets, clientId } };
    }
    if (path === "/gpsiot/assets/by-custom-id") {
      const assets = await getGpsIotAssetByCustomId(
        secrets,
        accessToken,
        String(body.customId ?? body.CustomId ?? ""),
        fetchImpl
      );
      return { status: 200, body: { ok: true, assets } };
    }
    if (path === "/gpsiot/assets/by-name") {
      const assets = await getGpsIotAssetByName(
        secrets,
        accessToken,
        String(body.name ?? body.VName ?? body.vName ?? ""),
        fetchImpl
      );
      return { status: 200, body: { ok: true, assets } };
    }
    if (path === "/gpsiot/devices/save") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const saved = await saveGpsIotDevice(secrets, accessToken, { ...body, clientId }, fetchImpl);
      return { status: 200, body: { ok: true, stored: true, ...saved } };
    }
    if (path === "/gpsiot/devices/decommission") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const result = await decommissionGpsIotDevice(secrets, accessToken, { ...body, clientId }, fetchImpl);
      return { status: 200, body: { ok: true, ...result } };
    }
    if (path === "/gpsiot/drivers/save") {
      const clientId = await resolveClientId(body, secrets, accessToken, input.databases, fetchImpl);
      if (!clientId) {
        return { status: 400, body: { ok: false, error: "clientId or a matched databaseName is required" } };
      }
      const saved = await saveGpsIotDriver(secrets, accessToken, { ...body, clientId }, fetchImpl);
      return { status: 200, body: { ok: true, stored: true, ...saved } };
    }
    if (path === "/gpsiot/drivers" && method === "DELETE") {
      const deleted = await deleteGpsIotDriver(
        secrets,
        accessToken,
        String(body.driverId ?? body.DriverId ?? body.DriverID ?? ""),
        fetchImpl
      );
      return { status: 200, body: { ok: true, ...deleted } };
    }
    const clients = await fetchGpsIotClients(secrets, accessToken, fetchImpl);
    const mapped = matchClientsToDatabases(clients, input.databases);
    return { status: 200, body: { ok: true, ...mapped } };
  } catch (error) {
    if (error instanceof GpsIotClientError) {
      return { status: error.status, body: { ok: false, error: error.message } };
    }
    const message = error instanceof Error ? error.message : "GPS IoT client request failed";
    return { status: 502, body: { ok: false, error: message } };
  }
}
