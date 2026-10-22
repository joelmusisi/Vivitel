import {
  DEVICE_ALERT_MESSAGE_TOKENS,
  extractTokenKeysFromMessage,
  resolveMessageTemplate,
  tokenTableValue
} from "./deviceAlertMessageTokens";

export const DEVICE_ALERT_EMAIL_FROM = "noreply@vivitelematics.ca";
export const VIVI_ALERT_EMAIL_FROM_NAME = "VIVI Telematics";
export const VIVI_ALERT_EMAIL_SLOGAN = "Smarter Fleets. Safer Roads.";
export const VIVI_ALERT_EMAIL_WEBSITE = "www.vivitelematics.com";
export const VIVI_ALERT_EMAIL_WEBSITE_URL = "https://www.vivitelematics.com";

const VIVI_GREEN = "#89c84a";
const VIVI_GREEN_DARK = "#5fa828";
const VIVI_BLACK = "#0a0a0a";
const VIVI_PUBLIC_ORIGIN = "https://us.vivitelematics.ca";
const VIVI_LOGO_ON_DARK = `${VIVI_PUBLIC_ORIGIN}/logo-vivi-telematics-nav-dark.png`;
const VIVI_LOGO_ON_LIGHT = `${VIVI_PUBLIC_ORIGIN}/logo-vivi-telematics-nav-light.png`;

export type DeviceAlertEmailEvent = {
  organisationName?: string;
  siteName?: string;
  assetDescription: string;
  registrationNumber?: string;
  assetId?: string;
  driverName?: string;
  notificationName: string;
  eventDateTime: string;
  eventValue?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  actualSpeed?: string;
  speedLimit?: string;
  heading?: string;
  mapImageUrl?: string;
  assetSmsNumber?: string;
  driverId?: string;
  driverMobile?: string;
  eventId?: string;
};

export type DeviceAlertEmailBuildOptions = {
  messageTemplate?: string;
  messageTokens?: string[];
};

const escapeHtml = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatLatitude = (value?: number) => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value!);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const hemisphere = value! < 0 ? "S" : "N";
  return `${hemisphere} ${String(degrees).padStart(2, "0")}° ${minutes.toFixed(3).padStart(6, "0")}' (${value})`;
};

const formatLongitude = (value?: number) => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value!);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const hemisphere = value! < 0 ? "W" : "E";
  return `${hemisphere} ${String(degrees).padStart(2, "0")}° ${minutes.toFixed(3).padStart(6, "0")}' (${value})`;
};

const HEADING_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function formatCompassHeading(degrees?: number): string | undefined {
  if (!Number.isFinite(degrees)) return undefined;
  const normalized = ((degrees! % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % HEADING_POINTS.length;
  return `${Math.round(normalized)} deg ${HEADING_POINTS[index]}`;
}

const ALERT_MAP_WIDTH = 640;
const ALERT_MAP_HEIGHT = 320;

export function buildAlertMapImageUrl(
  latitude?: number,
  longitude?: number,
  googleMapsApiKey?: string
): string | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  const key = String(googleMapsApiKey ?? "").trim();
  if (key) {
    return [
      "https://maps.googleapis.com/maps/api/staticmap",
      `?center=${latitude},${longitude}`,
      "&zoom=15",
      `&size=${ALERT_MAP_WIDTH}x${ALERT_MAP_HEIGHT}`,
      "&scale=2",
      "&maptype=roadmap",
      `&markers=color:red%7C${latitude},${longitude}`,
      `&key=${encodeURIComponent(key)}`
    ].join("");
  }
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=${ALERT_MAP_WIDTH}x${ALERT_MAP_HEIGHT}&markers=${latitude},${longitude},red-pushpin`;
}

function buildAlertMapSnippetHtml(event: DeviceAlertEmailEvent, locationLabel: string): string {
  if (!locationLabel && !event.mapImageUrl) return "";
  const label = escapeHtml(locationLabel || "Incident location");
  const mapUrl = escapeHtml(event.mapImageUrl ?? "");
  const mapsHref = Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
    ? `https://www.google.com/maps?q=${event.latitude},${event.longitude}`
    : "";
  const callout = `<div style="display:inline-block;background:#ffffff;border:1px solid #bdc1c6;border-radius:4px;padding:6px 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:#202124;line-height:1.35;box-shadow:0 1px 4px rgba(32,33,36,0.24);">${label}</div>
              <div style="width:0;height:0;margin:0 auto;border-left:7px solid transparent;border-right:7px solid transparent;border-top:8px solid #ffffff;"></div>`;
  const mapImage = event.mapImageUrl
    ? `<img src="${mapUrl}" alt="Notification location" width="${ALERT_MAP_WIDTH}" height="${ALERT_MAP_HEIGHT}" style="display:block;width:100%;max-width:${ALERT_MAP_WIDTH}px;height:auto;border:0;" />`
    : "";
  const linkedMap = mapsHref && event.mapImageUrl
    ? `<a href="${escapeHtml(mapsHref)}" target="_blank" rel="noopener noreferrer" style="display:block;line-height:0;text-decoration:none;">${mapImage}</a>`
    : mapImage;
  const overlay = `<div style="padding:36px 16px;text-align:center;background:#eaf6ea;">${callout}</div>`;

  return `<div style="margin-top:18px;max-width:${ALERT_MAP_WIDTH}px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#eaf6ea;">
            <div style="line-height:0;">
              ${event.mapImageUrl ? linkedMap : overlay}
            </div>
            ${locationLabel ? `<div style="padding:10px 14px;background:#ffffff;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111827;line-height:1.4;">&#128205; ${label}</div>` : ""}
          </div>`;
}

export function resolveSystemAssetId(asset: Record<string, unknown> | null | undefined): string | undefined {
  const numeric = Number((asset as any)?.assetId);
  if (Number.isFinite(numeric) && numeric > 0) return String(Math.trunc(numeric));
  const fallback = String((asset as any)?.fleetNumber ?? (asset as any)?.id ?? "").trim();
  return fallback || undefined;
}

export function resolveAssetRegistration(asset: Record<string, unknown> | null | undefined): string | undefined {
  const a = (asset ?? {}) as Record<string, unknown>;
  const value = String(a.registration ?? a.registrationNumber ?? a.plate ?? a.licensePlate ?? "").trim();
  return value || undefined;
}

export function resolveAssetOrganisation(
  asset: Record<string, unknown> | null | undefined,
  fallback?: string
): string | undefined {
  const a = (asset ?? {}) as Record<string, unknown>;
  const value = String(a.organisation ?? a.organization ?? a.company ?? a.client ?? a.customer ?? fallback ?? "").trim();
  return value || undefined;
}

export async function reverseGeocodeLabel(
  latitude?: number,
  longitude?: number,
  googleMapsApiKey?: string
): Promise<string> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const key = String(googleMapsApiKey ?? "").trim();
  try {
    if (key) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${encodeURIComponent(key)}`
      );
      if (response.ok) {
        const body = (await response.json()) as any;
        const formatted = String(body?.results?.[0]?.formatted_address ?? "").trim();
        if (formatted) return formatted;
      }
    }
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=17`,
      { headers: { accept: "application/json", "user-agent": "ViviTelematics/1.0 (alert-email)" } }
    );
    if (!response.ok) return "";
    const body = (await response.json()) as any;
    return String(body?.display_name ?? "").trim();
  } catch {
    return "";
  }
}

export type SiteTimeZoneSettings = {
  defaultTimeZone?: string;
  sites?: Record<string, string>;
};

const TIME_ZONE_ABBR_BY_IANA: Record<string, string> = {
  UTC: "UTC",
  "Africa/Dar_es_Salaam": "EAT",
  "Africa/Nairobi": "EAT",
  "Africa/Kampala": "EAT",
  "Africa/Addis_Ababa": "EAT",
  "Africa/Johannesburg": "SAST",
  "Africa/Lagos": "WAT",
  "Africa/Accra": "GMT",
  "Africa/Cairo": "EET",
  "Africa/Harare": "CAT",
  "Africa/Lusaka": "CAT",
  "Africa/Maputo": "CAT",
  "Africa/Kigali": "CAT",
  "Africa/Khartoum": "CAT",
  "Europe/London": "GMT",
  "America/New_York": "EST",
  "America/Los_Angeles": "PST",
  "Asia/Dubai": "GST",
  "Asia/Singapore": "SGT",
  "Asia/Tokyo": "JST"
};

export function resolveTimeZoneForSite(site: unknown, settings: SiteTimeZoneSettings | null | undefined): string {
  const fallback = String(settings?.defaultTimeZone ?? "").trim() || "Africa/Dar_es_Salaam";
  const needle = String(site ?? "").trim().toLowerCase();
  const sites = settings?.sites ?? {};
  if (needle) {
    for (const [key, value] of Object.entries(sites)) {
      if (String(key ?? "").trim().toLowerCase() === needle) {
        const tz = String(value ?? "").trim();
        if (tz) return tz;
      }
    }
  }
  return fallback;
}

export function formatNotificationDateTime(
  value: unknown,
  site: unknown,
  settings: SiteTimeZoneSettings | null | undefined
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  const timeZone = resolveTimeZoneForSite(site, settings);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short"
    }).formatToParts(new Date(parsed));
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      String(parts.find((part) => part.type === type)?.value ?? "").trim();
    const date = [pick("day"), pick("month"), pick("year")].filter(Boolean).join("/");
    const time = [pick("hour"), pick("minute"), pick("second")].filter(Boolean).join(":");
    const tzRaw = pick("timeZoneName");
    const mapped = TIME_ZONE_ABBR_BY_IANA[timeZone];
    const isOffsetLabel = /(?:gmt|utc)\s*[+-]/i.test(tzRaw) || /^[+-]\d/.test(tzRaw);
    const tzLabel = mapped || (!isOffsetLabel && tzRaw ? tzRaw : "") || "EAT";
    return `${date} ${time} ${tzLabel}`.trim();
  } catch {
    return raw;
  }
}

export async function loadSiteTimeZoneSettings(
  kv: { get: (key: string) => Promise<string | null> },
  tenantId?: string
): Promise<SiteTimeZoneSettings | null> {
  const keys = ["settings:siteTimeZones"];
  const tenant = String(tenantId ?? "").trim();
  if (tenant) keys.unshift(`settings:siteTimeZones:${tenant}`);
  for (const key of keys) {
    try {
      const raw = await kv.get(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as SiteTimeZoneSettings;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // try next key
    }
  }
  return null;
}

export function resolveNotificationValue(input: {
  notificationName?: string;
  eventValue?: string;
  actualSpeed?: string;
  speedKph?: number;
  attributes?: Record<string, unknown>;
  locationName?: string;
}): string {
  const name = String(input.notificationName ?? "").toLowerCase();
  const speedFromKph = Number.isFinite(input.speedKph) ? `${Math.round(input.speedKph as number)} km/h` : "";
  const speedFromText = String(input.actualSpeed ?? "").trim();
  const speed = speedFromKph || speedFromText;
  const attrs = input.attributes ?? {};
  const rawAttr = String(
    attrs.speed ?? attrs.value ?? attrs.eventValue ?? attrs.alarm ?? input.eventValue ?? ""
  ).trim();
  const isSpeedEvent = /speed|overspeed|over.?speeding|speeding/.test(name);

  if (isSpeedEvent) {
    if (speed) return speed;
    const n = Number(rawAttr);
    if (Number.isFinite(n) && n > 0) {
      const kph = n > 120 ? n : n * 1.852;
      return `${Math.round(kph)} km/h`;
    }
    return rawAttr;
  }

  if (rawAttr && !/^\d+(\.\d+)?$/.test(rawAttr)) return rawAttr;
  if (speed) return speed;
  if (rawAttr) return rawAttr;
  if (input.locationName && /geofence|enter|exit|arrival|depart/.test(name)) return input.locationName;
  return "";
}

export function buildDeviceAlertEmailSubject(
  event: Pick<DeviceAlertEmailEvent, "assetDescription" | "registrationNumber" | "driverName" | "notificationName">
): string {
  const description = String(event.assetDescription ?? "").trim() || "Asset";
  const registration = String(event.registrationNumber ?? "").trim();
  const driver = String(event.driverName ?? "").trim() || "Unknown";
  const notification = String(event.notificationName ?? "").trim() || "Alert";
  const registrationPart = registration ? ` (${registration})` : "";
  return `${description}${registrationPart}/${driver} -- ${notification}`;
}

function viviWordmarkHtml(variant: "dark" | "light"): string {
  const src = variant === "dark" ? VIVI_LOGO_ON_DARK : VIVI_LOGO_ON_LIGHT;
  return `<img src="${src}" alt="VIVI Telematics" width="132" height="72" style="display:block;border:0;outline:none;width:132px;height:72px;" />`;
}

function viviEmailHeaderHtml(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${VIVI_BLACK};">
    <tr>
      <td style="padding:20px 28px;background-color:${VIVI_BLACK};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="padding:0;">
              ${viviWordmarkHtml("dark")}
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d1d5db;margin-top:8px;letter-spacing:0.2px;">${escapeHtml(VIVI_ALERT_EMAIL_SLOGAN)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td height="4" style="height:4px;background-color:${VIVI_GREEN};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;
}

function viviEmailFooterHtml(): string {
  return `<div style="margin-top:28px;font-size:14px;color:#111827;line-height:1.6;">
    Kind regards,
  </div>
  <div style="margin-top:16px;">
    ${viviWordmarkHtml("light")}
  </div>
  <div style="margin-top:6px;font-size:12px;color:#6b7280;">
    <span>${escapeHtml(VIVI_ALERT_EMAIL_SLOGAN)}</span> &middot;
    <a href="${escapeHtml(VIVI_ALERT_EMAIL_WEBSITE_URL)}" style="color:${VIVI_GREEN_DARK};text-decoration:none;">${escapeHtml(VIVI_ALERT_EMAIL_WEBSITE)}</a>
  </div>`;
}

const isBlankValue = (value: string) => {
  const v = String(value ?? "").trim();
  return !v || v === "—" || /^NA(\s*km\/h)?$/i.test(v);
};

const detailRow = (label: string, value: string) =>
  isBlankValue(value) ? "" : `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;width:220px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;vertical-align:top;">${escapeHtml(value || "—")}</td>
  </tr>`;

function resolveTokenKeys(event: DeviceAlertEmailEvent, options?: DeviceAlertEmailBuildOptions): string[] {
  const template = String(options?.messageTemplate ?? "").trim();
  if (options?.messageTokens?.length) return options.messageTokens;
  if (template) return extractTokenKeysFromMessage(template);
  return [];
}

export function buildDeviceAlertEmailText(
  event: DeviceAlertEmailEvent,
  options?: DeviceAlertEmailBuildOptions
): string {
  const subject = buildDeviceAlertEmailSubject(event);
  const template = String(options?.messageTemplate ?? "").trim();
  const tokenKeys = resolveTokenKeys(event, options);

  const lines = [subject, ""];

  if (template) {
    lines.push(resolveMessageTemplate(template, event), "");
  }

  if (!tokenKeys.length) {
    lines.push(
      `Event notification: ${event.eventDateTime}`,
      `${event.assetDescription}${event.registrationNumber ? ` (${event.registrationNumber})` : ""} – ${event.notificationName}`,
      "",
      ...(event.organisationName ? [`Organisation name: ${event.organisationName}`] : []),
      ...(event.siteName ? [`Site name: ${event.siteName}`] : []),
      `Asset description: ${event.assetDescription}`,
      `Registration number: ${event.registrationNumber ?? "—"}`,
      ...(event.assetId ? [`Asset ID: ${event.assetId}`] : []),
      `Driver name: ${event.driverName ?? "Unknown"}`,
      `Notification Description: ${event.notificationName}`,
      `Notification Date and Time: ${event.eventDateTime}`,
      ...(event.eventValue ? [`Notification value: ${event.eventValue}`] : []),
      ...(event.locationName ? [`Location name: ${event.locationName}`] : []),
      ...(Number.isFinite(event.latitude) ? [`Latitude: ${formatLatitude(event.latitude)}`] : []),
      ...(Number.isFinite(event.longitude) ? [`Longitude: ${formatLongitude(event.longitude)}`] : []),
      ...(event.actualSpeed ? [`Actual Speed: ${event.actualSpeed}`] : []),
      ...(event.speedLimit ? [`Speed Limit: ${event.speedLimit}`] : []),
      ...(event.heading ? [`Heading: ${event.heading}`] : [])
    );
  } else {
    for (const token of DEVICE_ALERT_MESSAGE_TOKENS) {
      if (!tokenKeys.includes(token.key)) continue;
      lines.push(`${token.tableLabel}: ${tokenTableValue(token.key, event)}`);
    }
    if (event.locationName && !tokenKeys.includes("gpsLatitude") && !tokenKeys.includes("gpsLongitude")) {
      lines.push(`Location name: ${event.locationName}`);
    }
  }

  lines.push("", "Kind regards,", "VIVI Telematics", VIVI_ALERT_EMAIL_SLOGAN, VIVI_ALERT_EMAIL_WEBSITE);
  return lines.join("\n");
}

function buildDetailRows(event: DeviceAlertEmailEvent, tokenKeys: string[]): string {
  if (!tokenKeys.length) {
    return [
      detailRow("Organisation name", event.organisationName ?? "—"),
      detailRow("Site name", event.siteName ?? "—"),
      detailRow("Asset description", event.assetDescription),
      detailRow("Registration number", event.registrationNumber ?? "—"),
      detailRow("Asset ID", event.assetId ?? "—"),
      detailRow("Driver name", event.driverName ?? "Unknown"),
      detailRow("Notification Description", event.notificationName),
      detailRow("Notification Date and Time", event.eventDateTime),
      detailRow("Notification value", event.eventValue ?? "—"),
      detailRow("Location name", event.locationName ?? "—"),
      detailRow("Latitude", Number.isFinite(event.latitude) ? formatLatitude(event.latitude) : "—"),
      detailRow("Longitude", Number.isFinite(event.longitude) ? formatLongitude(event.longitude) : "—"),
      detailRow("Actual Speed", event.actualSpeed ?? "—"),
      detailRow("Speed Limit", event.speedLimit ?? "—"),
      detailRow("Heading", event.heading ?? "—")
    ].join("");
  }

  return DEVICE_ALERT_MESSAGE_TOKENS
    .filter((token) => tokenKeys.includes(token.key))
    .map((token) => detailRow(token.tableLabel, tokenTableValue(token.key, event)))
    .join("");
}

export function buildDeviceAlertEmailHtml(
  event: DeviceAlertEmailEvent,
  options?: DeviceAlertEmailBuildOptions
): string {
  const template = String(options?.messageTemplate ?? "").trim();
  const tokenKeys = resolveTokenKeys(event, options);
  const resolvedMessage = template ? resolveMessageTemplate(template, event) : "";
  const eventDateLabel = String(event.eventDateTime ?? "").split(" ")[0] || event.eventDateTime;
  const summaryLine = resolvedMessage || [
    event.eventDateTime,
    event.assetDescription,
    event.notificationName,
    event.eventValue,
    event.driverName ?? "Unknown"
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const locationLabel = String(event.locationName ?? "").trim() || (
    Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
      ? `${event.latitude}, ${event.longitude}`
      : ""
  );
  const mapBlock = buildAlertMapSnippetHtml(event, locationLabel);

  const customMessageBlock = template
    ? `<div style="font-size:15px;color:#111827;line-height:1.6;margin-bottom:18px;white-space:pre-wrap;">${escapeHtml(resolvedMessage)}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${viviEmailHeaderHtml()}
      <div style="padding:24px 28px;">
        <div style="font-size:28px;font-weight:700;color:${VIVI_GREEN_DARK};margin-bottom:8px;">Notification: ${escapeHtml(eventDateLabel)}</div>
        <div style="font-size:24px;font-weight:700;color:${VIVI_GREEN_DARK};margin-bottom:14px;">
          ${escapeHtml(event.assetDescription)}${event.registrationNumber ? ` – ${escapeHtml(event.registrationNumber)}` : ""} – ${escapeHtml(event.notificationName)}
        </div>
        <div style="font-size:13px;color:#4b5563;margin-bottom:18px;">${escapeHtml(summaryLine)}</div>
        ${customMessageBlock}
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${buildDetailRows(event, tokenKeys)}
        </table>
        ${mapBlock}
        ${viviEmailFooterHtml()}
      </div>
    </div>
  </body>
</html>`;
}
