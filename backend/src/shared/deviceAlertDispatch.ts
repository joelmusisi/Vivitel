import {
  AlertEmailRetryableError,
  alertEmailEventKey,
  createRecipientEmailResolver,
  sendAlertEmailOnce
} from "./alertEmailDelivery";
import { buildAlertMapAttachment } from "./alertMapImage";
import {
  buildAlertMapImageUrl,
  buildDeviceAlertEmailHtml,
  buildDeviceAlertEmailSubject,
  buildDeviceAlertEmailText,
  reverseGeocodeLabel,
  resolveAssetOrganisation,
  resolveAssetRegistration,
  formatCompassHeading,
  formatNotificationDateTime,
  loadSiteTimeZoneSettings,
  resolveNotificationValue,
  resolveSystemAssetId,
  type DeviceAlertEmailEvent,
  type SiteTimeZoneSettings
} from "./deviceAlertEmail";
import { libraryNotificationIsAvailable, bindingCoversSiteEvent } from "./siteNotificationScope";
import {
  alertDedupeKey,
  appendInAppAlert,
  loadSiteNotificationLibrary,
  loadViviNotificationRules,
  type UserAlertDispatchEnv,
  type ViviNotificationRule
} from "./userAlertDispatch";

type AlertRecipientRef = {
  id?: string;
  name?: string;
  email?: string;
  mobile?: string;
};

type DeviceAlertBinding = {
  id?: string;
  name?: string;
  site?: string;
  monitoredEvents?: string[];
  sendFor?: string;
  selectedAssets?: string[];
  selectedDrivers?: string[];
  emailRecipients?: AlertRecipientRef[];
  pushRecipients?: AlertRecipientRef[];
  recipients?: Array<{ name?: string; channel?: string }>;
  notificationOwner?: string;
  message?: string;
  messageTokens?: string[];
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

function isDeviceAlertBinding(binding: DeviceAlertBinding): boolean {
  return Boolean(
    String(binding.sendFor ?? "").trim()
    || String(binding.notificationOwner ?? "").trim()
    || String(binding.message ?? "").trim()
    || (Array.isArray(binding.emailRecipients) && binding.emailRecipients.length > 0)
    || (Array.isArray(binding.pushRecipients) && binding.pushRecipients.length > 0)
    || (Array.isArray(binding.recipients) && binding.recipients.length > 0)
    || (Array.isArray(binding.selectedAssets) && binding.selectedAssets.length > 0)
    || (Array.isArray(binding.selectedDrivers) && binding.selectedDrivers.length > 0)
  );
}

function readBindingEmailRecipients(binding: DeviceAlertBinding): AlertRecipientRef[] {
  if (Array.isArray(binding.emailRecipients) && binding.emailRecipients.length) {
    // Users without a saved address still count: their current email is looked up by id.
    return binding.emailRecipients.filter((row) => {
      const id = String(row?.id ?? "").trim();
      return String(row?.email ?? "").includes("@") || (Boolean(id) && !id.startsWith("contact-"));
    });
  }
  return (binding.recipients ?? [])
    .filter((row) => normalize(row?.channel) === "email" || !row?.channel)
    .map((row) => ({ name: row?.name, email: row?.name }))
    .filter((row) => String(row.email ?? "").includes("@"));
}

async function loadDeviceAlertBindings(env: UserAlertDispatchEnv, tenantId: string): Promise<DeviceAlertBinding[]> {
  const result = await env.VIVI_D1.prepare(
    "SELECT data FROM bindings WHERE tenant_id = ?1 AND type = ?2 ORDER BY updated_at DESC"
  )
    .bind(tenantId, "notifications")
    .all<{ data?: string }>();

  const bindings: DeviceAlertBinding[] = [];
  for (const row of result.results ?? []) {
    try {
      const parsed = JSON.parse(String(row.data ?? "{}")) as DeviceAlertBinding;
      if (isDeviceAlertBinding(parsed)) bindings.push(parsed);
    } catch {
      // ignore malformed rows
    }
  }
  return bindings;
}

async function traccarFetch(env: UserAlertDispatchEnv, pathnameWithQuery: string) {
  const base = String(env.TRACCAR_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return { ok: false, status: 0, body: null as unknown };
  const url = `${base}${pathnameWithQuery.startsWith("/") ? "" : "/"}${pathnameWithQuery}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const token = String(env.TRACCAR_TOKEN ?? "").trim();
  const user = String(env.TRACCAR_USERNAME ?? "").trim();
  const pass = String(env.TRACCAR_PASSWORD ?? "").trim();
  if (token) headers.authorization = `Bearer ${token}`;
  else if (user && pass) headers.authorization = `Basic ${btoa(`${user}:${pass}`)}`;
  const response = await fetch(url, { headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

async function findAssetsByImei(env: UserAlertDispatchEnv, tenantId: string, imei: string) {
  const needle = String(imei ?? "").trim();
  if (!needle) return [] as Record<string, unknown>[];
  const result = await env.VIVI_D1.prepare(
    "SELECT data FROM assets WHERE tenant_id = ?1 AND data LIKE ?2 ORDER BY updated_at DESC"
  )
    .bind(tenantId, `%"imei":"${needle}"%`)
    .all();
  const assets: Record<string, unknown>[] = [];
  for (const row of result.results ?? []) {
    try {
      const parsed = JSON.parse(String((row as { data?: string }).data)) as Record<string, unknown>;
      if (String(parsed.imei ?? "").trim() === needle) assets.push(parsed);
    } catch {
      // ignore malformed rows
    }
  }
  return assets;
}

function bindingMatchesEvent(
  binding: DeviceAlertBinding,
  notificationName: string,
  assetLabel: string,
  driverName: string,
  assetSite: string
) {
  if (!bindingCoversSiteEvent(binding, notificationName, assetSite)) return false;

  const selectedAssets = (binding.selectedAssets ?? []).map((item) => normalize(item));
  if (selectedAssets.length && !selectedAssets.includes(normalize(assetLabel))) return false;

  const selectedDrivers = (binding.selectedDrivers ?? []).map((item) => normalize(item));
  if (selectedDrivers.length && !selectedDrivers.includes(normalize(driverName))) return false;

  return true;
}

function buildEmailEventFromContext(input: {
  asset: Record<string, unknown>;
  notificationName: string;
  eventTime: string;
  position?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  timeZoneSettings?: SiteTimeZoneSettings | null;
  googleMapsApiKey?: string;
}): DeviceAlertEmailEvent {
  const asset = input.asset;
  const position = input.position ?? {};
  const attrs = input.attributes ?? {};
  const posAttrs = (position.attributes && typeof position.attributes === "object"
    ? position.attributes
    : {}) as Record<string, unknown>;
  const rawSpeed = Number(attrs.speedKph ?? position.speedKph ?? attrs.speed ?? position.speed ?? posAttrs.speed ?? NaN);
  const speedAlreadyKph = attrs.speedKph != null || position.speedKph != null;
  const speedKph = Number.isFinite(rawSpeed)
    ? Math.round(speedAlreadyKph || rawSpeed > 120 ? rawSpeed : rawSpeed * 1.852)
    : undefined;
  const speedText = speedKph != null ? `${speedKph} km/h` : undefined;
  const course = Number(position.course ?? position.heading ?? attrs.course ?? NaN);
  const heading = formatCompassHeading(course);
  const latitude = Number(attrs.latitude ?? attrs.lat ?? position.latitude ?? position.lat);
  const longitude = Number(attrs.longitude ?? attrs.lng ?? attrs.lon ?? position.longitude ?? position.lng ?? position.lon);
  const locationName = String(
    attrs.geofenceName
    ?? attrs.locationName
    ?? attrs.address
    ?? attrs.location
    ?? position.address
    ?? posAttrs.address
    ?? posAttrs.geofenceName
    ?? ""
  ).trim();
  const eventValue = resolveNotificationValue({
    notificationName: input.notificationName,
    actualSpeed: speedText,
    speedKph,
    attributes: { ...posAttrs, ...attrs },
    locationName
  });

  return {
    organisationName: resolveAssetOrganisation(asset),
    siteName: String(asset.site ?? "").trim() || undefined,
    assetDescription: String(asset.assetDescription ?? asset.description ?? asset.name ?? "Asset").trim(),
    registrationNumber: resolveAssetRegistration(asset),
    assetId: resolveSystemAssetId(asset),
    driverName: String(asset.driverName ?? asset.driver ?? asset.assignedDriver ?? "Unknown").trim() || "Unknown",
    notificationName: input.notificationName,
    eventDateTime:
      formatNotificationDateTime(input.eventTime, String(asset.site ?? "").trim(), input.timeZoneSettings)
      || input.eventTime,
    eventValue: eventValue || undefined,
    locationName: locationName || undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    actualSpeed: speedText,
    speedLimit: "NA km/h",
    heading,
    mapImageUrl: buildAlertMapImageUrl(latitude, longitude, input.googleMapsApiKey)
  };
}

/** Separate from the user-alert marker so neither dispatcher hides the other's event. */
const deviceAlertDedupeKey = (tenantId: string, eventId: number) => `${alertDedupeKey(tenantId, eventId)}:device`;

/**
 * Names this event may be monitored under. Alerts store the library description
 * (e.g. "Speeding"), while Traccar only reports a type (e.g. deviceOverspeed):
 * - an event that names itself (alarm / description attribute) uses that name;
 * - otherwise every library rule of the same Traccar type is a candidate (an
 *   unnamed alarm is shared by many rows, so it never borrows one);
 * - the raw type and an explicit name are kept for bindings that store those.
 */
export function deviceAlertNotificationNames(input: {
  eventType: string;
  attributes?: Record<string, unknown>;
  rules?: Array<Pick<ViviNotificationRule, "traccarType" | "description">>;
  explicitName?: string;
}): string[] {
  const names: string[] = [];
  const add = (value: unknown) => {
    const name = String(value ?? "").trim();
    if (name && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  };
  const attrs = input.attributes ?? {};
  const named = String(attrs.alarm ?? attrs.description ?? "").trim();
  add(input.explicitName);
  if (named) add(named);
  else if (input.eventType !== "alarm") {
    for (const rule of input.rules ?? []) {
      if (rule.traccarType === input.eventType) add(rule.description);
    }
  }
  add(attrs.message);
  add(input.eventType);
  return names;
}

export async function dispatchDeviceAlertEmailsForTraccarEvent(
  env: UserAlertDispatchEnv,
  input: {
    tenantId: string;
    traccarEvent: { id?: number; type?: string; eventTime?: string; deviceId?: number; attributes?: Record<string, unknown> };
    notificationName?: string;
    rules?: ViviNotificationRule[];
  }
): Promise<{ dispatched: boolean; emailed: number; reason?: string }> {
  const tenantId = String(input.tenantId ?? "").trim();
  const deviceId = Number(input.traccarEvent.deviceId);
  const eventId = Number(input.traccarEvent.id);
  const eventTime = String(input.traccarEvent.eventTime ?? new Date().toISOString()).trim();
  if (!tenantId || !Number.isFinite(deviceId) || deviceId <= 0) {
    return { dispatched: false, emailed: 0, reason: "missing tenant or device" };
  }
  if (Number.isFinite(eventId) && eventId > 0) {
    const alreadySent = await env.ViviTEL.get(deviceAlertDedupeKey(tenantId, eventId));
    if (alreadySent) return { dispatched: false, emailed: 0, reason: "already sent to the people added on this alert" };
  }

  const bindings = await loadDeviceAlertBindings(env, tenantId);
  if (!bindings.length) return { dispatched: false, emailed: 0, reason: "no device alerts" };

  const deviceResp = await traccarFetch(env, `/api/devices?id=${encodeURIComponent(String(deviceId))}`);
  const device = Array.isArray(deviceResp.body) ? (deviceResp.body[0] as Record<string, unknown>) : null;
  const imei = String(device?.uniqueId ?? "").trim();
  const assets = await findAssetsByImei(env, tenantId, imei);
  const attrs = (input.traccarEvent.attributes ?? {}) as Record<string, unknown>;
  const eventType = String(input.traccarEvent.type ?? "").trim();
  const rules = input.rules ?? (await loadViviNotificationRules(env).catch(() => [] as ViviNotificationRule[]));
  const candidateNames = deviceAlertNotificationNames({
    eventType,
    attributes: attrs,
    rules,
    explicitName: input.notificationName
  });
  if (!candidateNames.length) return { dispatched: false, emailed: 0, reason: "missing notification name" };

  const matches = (assets.length ? assets : []).flatMap((asset) => {
    const assetSite = String(asset.site ?? "").trim();
    const assetLabel = String(
      asset.assetDescription ?? asset.description ?? asset.registration ?? asset.name ?? device?.name ?? "Asset"
    ).trim();
    const driverName = String(asset.driverName ?? asset.driver ?? asset.assignedDriver ?? "Unknown").trim() || "Unknown";
    return bindings.flatMap((binding) => {
      const notificationName = candidateNames.find((name) =>
        bindingMatchesEvent(binding, name, assetLabel, driverName, assetSite)
      );
      return notificationName ? [{ binding, asset, assetLabel, driverName, notificationName }] : [];
    });
  });
  if (!matches.length) return { dispatched: false, emailed: 0, reason: "no matching device alert bindings" };
  // Several thresholds of one type (e.g. two speed alerts) cannot be told apart from an
  // unnamed event; do not email under the wrong alert's name.
  const matchedNames = new Set(matches.map((match) => match.notificationName.toLowerCase()));
  const eventNamesItself = Boolean(String(attrs.alarm ?? attrs.description ?? "").trim());
  const isGeofence = eventType === "geofenceEnter" || eventType === "geofenceExit";
  if (matchedNames.size > 1 && !eventNamesItself && !isGeofence) {
    console.warn("Device alert skipped: event matches several alerts", { tenantId, eventType, names: [...matchedNames] });
    return { dispatched: false, emailed: 0, reason: "event does not name one site notification" };
  }

  const positionResp = await traccarFetch(
    env,
    `/api/positions?deviceId=${encodeURIComponent(String(deviceId))}&limit=1`
  );
  const position = Array.isArray(positionResp.body) ? (positionResp.body[0] as Record<string, unknown>) : undefined;
  const timeZoneSettings = await loadSiteTimeZoneSettings(env.ViviTEL, tenantId);

  const emailedRecipients = new Set<string>();
  const notifiedUsers = new Set<string>();
  const retryableEmailFailures: unknown[] = [];
  const resolveEmail = createRecipientEmailResolver(env);
  const eventKey = alertEmailEventKey({ ...input.traccarEvent, type: eventType });
  const libraryBySite = new Map<string, Array<{ description?: string; availability?: string }>>();
  for (const { binding, asset, notificationName } of matches) {
    const assetSite = String(asset.site ?? "").trim();
    if (!libraryBySite.has(assetSite)) {
      libraryBySite.set(assetSite, await loadSiteNotificationLibrary(env, tenantId, assetSite));
    }
    if (!libraryNotificationIsAvailable(libraryBySite.get(assetSite) ?? [], notificationName)) continue;

    const emailEvent = buildEmailEventFromContext({
      asset,
      notificationName,
      eventTime,
      position,
      attributes: attrs,
      timeZoneSettings,
      googleMapsApiKey: env.GOOGLE_MAPS_API_KEY
    });
    if (!emailEvent.locationName) {
      emailEvent.locationName =
        (await reverseGeocodeLabel(emailEvent.latitude, emailEvent.longitude, env.GOOGLE_MAPS_API_KEY)) || undefined;
    }
    const mapAttachment = await buildAlertMapAttachment(emailEvent.latitude, emailEvent.longitude);
    if (mapAttachment) emailEvent.mapImageUrl = `cid:${mapAttachment.content_id}`;
    const subject = buildDeviceAlertEmailSubject(emailEvent);
    const messageTemplate = String(binding.message ?? "").trim();
    const messageTokens = Array.isArray(binding.messageTokens)
      ? binding.messageTokens.map((item) => String(item ?? "").trim()).filter(Boolean)
      : undefined;
    const emailOptions = messageTemplate || messageTokens?.length
      ? { messageTemplate, messageTokens }
      : undefined;
    const text = buildDeviceAlertEmailText(emailEvent, emailOptions);
    const html = buildDeviceAlertEmailHtml(emailEvent, emailOptions);

    for (const recipient of readBindingEmailRecipients(binding)) {
      const email = await resolveEmail(recipient);
      if (!email || emailedRecipients.has(email)) continue;
      try {
        const result = await sendAlertEmailOnce(env, {
          tenantId,
          eventKey,
          to: email,
          subject,
          text,
          html,
          attachments: mapAttachment ? [mapAttachment] : undefined
        });
        if (result !== "rejected") emailedRecipients.add(email);
      } catch (error) {
        // Continue with other recipients; this one is retried on the next poll.
        retryableEmailFailures.push(error);
        console.warn("Device alert email failed:", email, error);
      }
    }

    for (const recipient of binding.pushRecipients ?? []) {
      const userId = String(recipient.id ?? "").trim();
      if (!userId || userId.startsWith("contact-") || userId.includes("@") || notifiedUsers.has(userId)) continue;
      notifiedUsers.add(userId);
      const alertId = Number.isFinite(eventId) && eventId > 0 ? `traccar-event-${eventId}` : `traccar-event-${crypto.randomUUID()}`;
      await appendInAppAlert(env, {
        id: `${alertId}:${userId}`,
        tenantId,
        userId,
        eventLabel: notificationName,
        assetLabel: String(asset.assetDescription ?? asset.description ?? asset.name ?? "Asset").trim(),
        site: assetSite || undefined,
        message: text,
        severity: "warning",
        createdAt: eventTime,
        traccarEventId: Number.isFinite(eventId) ? eventId : undefined,
        traccarDeviceId: deviceId,
        channels: { inApp: true, email: emailedRecipients.size > 0 },
        read: false
      });
    }
  }

  if (retryableEmailFailures.length) {
    // Leave the event open so the next poll retries; people already emailed are skipped.
    throw new AlertEmailRetryableError(`${retryableEmailFailures.length} device alert email(s) failed; will retry`);
  }
  if ((emailedRecipients.size > 0 || notifiedUsers.size > 0) && Number.isFinite(eventId) && eventId > 0) {
    await env.ViviTEL.put(deviceAlertDedupeKey(tenantId, eventId), "1", { expirationTtl: 60 * 60 * 24 * 14 });
  }

  return {
    dispatched: emailedRecipients.size > 0 || notifiedUsers.size > 0,
    emailed: emailedRecipients.size,
    ...(emailedRecipients.size || notifiedUsers.size ? {} : { reason: "notification is not set or has no recipients" })
  };
}
