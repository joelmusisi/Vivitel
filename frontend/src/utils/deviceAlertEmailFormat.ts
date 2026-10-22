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
const VIVI_LOGO_ON_DARK = `${VIVI_PUBLIC_ORIGIN}/logo-vivi-telematics-dark.svg`;
const VIVI_LOGO_ON_LIGHT = `${VIVI_PUBLIC_ORIGIN}/logo-vivi-telematics-light.svg`;

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
const ALERT_MAP_HEIGHT = 400;

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
      `&markers=color:0x34a853%7Csize:mid%7C${latitude},${longitude}`,
      "&style=feature:poi.business%7Cvisibility:off",
      `&key=${encodeURIComponent(key)}`
    ].join("");
  }
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=${ALERT_MAP_WIDTH}x${ALERT_MAP_HEIGHT}&markers=${latitude},${longitude},ol-marker`;
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
  const overlay = event.mapImageUrl
    ? `<div style="position:absolute;left:12px;right:12px;top:42%;text-align:center;line-height:1.3;pointer-events:none;">${callout}</div>`
    : `<div style="padding:36px 16px;text-align:center;background:#eaf6ea;">${callout}</div>`;

  const searchChip = `<div style="position:absolute;top:12px;left:12px;right:72px;text-align:left;line-height:1.3;">
                <div style="display:inline-block;max-width:100%;background:#ffffff;border-radius:8px;padding:8px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#3c4043;box-shadow:0 1px 4px rgba(32,33,36,0.18);">${label}</div>
              </div>`;

  return `<div style="margin-top:18px;max-width:${ALERT_MAP_WIDTH}px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#eaf6ea;">
            <div style="position:relative;line-height:0;">
              ${linkedMap}
              ${event.mapImageUrl ? searchChip : ""}
              ${overlay}
            </div>
          </div>`;
}

export function resolveSystemAssetId(asset: Record<string, unknown> | null | undefined): string | undefined {
  const numeric = Number((asset as any)?.assetId);
  if (Number.isFinite(numeric) && numeric > 0) return String(Math.trunc(numeric));
  return undefined;
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
  const ink = variant === "dark" ? "#ffffff" : VIVI_BLACK;
  return `<img src="${src}" alt="VIVI Telematics" width="168" height="56" style="display:block;border:0;width:168px;height:56px;object-fit:contain;" />
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:4px;color:${ink};font-weight:600;margin-top:4px;">VIVI TELEMATICS</div>`;
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
            <td valign="middle" align="right" width="64" style="padding:0 0 0 16px;font-size:32px;line-height:1;">📍</td>
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
    Kind regards,<br />
    <strong>VIVI Telematics</strong><br />
    <span style="color:#4b5563;">${escapeHtml(VIVI_ALERT_EMAIL_SLOGAN)}</span>
  </div>
  <div style="margin-top:16px;">
    ${viviWordmarkHtml("light")}
  </div>
  <div style="margin-top:10px;font-size:12px;color:#6b7280;">
    <a href="${escapeHtml(VIVI_ALERT_EMAIL_WEBSITE_URL)}" style="color:${VIVI_GREEN_DARK};text-decoration:none;">${escapeHtml(VIVI_ALERT_EMAIL_WEBSITE)}</a>
  </div>`;
}

const detailRow = (label: string, value: string) =>
  `<tr>
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
        <div style="font-size:28px;font-weight:700;color:${VIVI_GREEN_DARK};margin-bottom:8px;">Event notification: ${escapeHtml(eventDateLabel)}</div>
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

export const SAMPLE_DEVICE_ALERT_EMAIL_EVENT: DeviceAlertEmailEvent = {
  organisationName: "Organisation name",
  siteName: "Site name",
  assetDescription: "Asset description",
  registrationNumber: "Registration number",
  assetId: "12",
  driverName: "Driver name",
  notificationName: "Overspeeding",
  eventDateTime: "14/09/2026 13:45:02 EAT",
  eventValue: "87 km/h",
  locationName: "Kampala Road, Kampala",
  actualSpeed: "87 km/h",
  speedLimit: "60 km/h",
  heading: "Heading",
  latitude: 0.3476,
  longitude: 32.5825
};
