export type DeviceAlertMessageToken = {
  key: string;
  label: string;
  tableLabel: string;
};

export type DeviceAlertMessageContext = {
  organisationName?: string;
  siteName?: string;
  assetDescription?: string;
  registrationNumber?: string;
  assetId?: string;
  driverName?: string;
  notificationName?: string;
  eventDateTime?: string;
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

export const DEVICE_ALERT_MESSAGE_TOKENS: DeviceAlertMessageToken[] = [
  { key: "assetDescription", label: "Asset description", tableLabel: "Asset description" },
  { key: "assetSmsNumber", label: "Asset SMS number", tableLabel: "Asset SMS number" },
  { key: "eventDateTime", label: "Notification Date and Time", tableLabel: "Notification Date and Time" },
  { key: "driverId", label: "Driver ID", tableLabel: "Driver ID" },
  { key: "driverName", label: "Driver name", tableLabel: "Driver name" },
  { key: "driverMobile", label: "Driver mobile number", tableLabel: "Driver mobile number" },
  { key: "eventDescription", label: "Notification Description", tableLabel: "Notification Description" },
  { key: "eventId", label: "Notification Name", tableLabel: "Notification Name" },
  { key: "eventValue", label: "Notification value", tableLabel: "Notification value" },
  { key: "locationName", label: "Location name", tableLabel: "Location name" },
  { key: "gpsLongitude", label: "GPS Longitude", tableLabel: "Longitude" },
  { key: "gpsLatitude", label: "GPS Latitude", tableLabel: "Latitude" },
  { key: "siteName", label: "Site name", tableLabel: "Site name" },
  { key: "speed", label: "Speed", tableLabel: "Actual Speed" },
  { key: "vehicleId", label: "Vehicle ID", tableLabel: "Asset ID" }
];

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

export const tokenPlaceholder = (label: string) => `{${label}}`;

const TOKEN_LABEL_ALIASES: Record<string, string[]> = {
  eventDescription: ["Notification description", "Event description"],
  eventId: ["Notification ID", "Event ID"],
  eventDateTime: ["Date/time of Event", "Date/time of event"],
  eventValue: ["Event value", "Violation value"]
};

const tokenLabelsFor = (token: DeviceAlertMessageToken) => [
  token.label,
  ...(TOKEN_LABEL_ALIASES[token.key] ?? [])
];

export function insertTokenIntoMessage(message: string, tokenLabel: string): string {
  const placeholder = tokenPlaceholder(tokenLabel);
  const trimmed = String(message ?? "").trimEnd();
  if (!trimmed) return placeholder;
  return `${trimmed} ${placeholder}`;
}

export function extractTokenKeysFromMessage(message: string): string[] {
  const text = String(message ?? "");
  const keys: string[] = [];
  for (const token of DEVICE_ALERT_MESSAGE_TOKENS) {
    if (tokenLabelsFor(token).some((label) => text.includes(tokenPlaceholder(label)))) {
      keys.push(token.key);
    }
  }
  return keys;
}

export function resolveTokenValue(key: string, context: DeviceAlertMessageContext): string {
  switch (key) {
    case "assetDescription":
      return String(context.assetDescription ?? "").trim() || "—";
    case "assetSmsNumber":
      return String(context.assetSmsNumber ?? "").trim() || "—";
    case "eventDateTime":
      return String(context.eventDateTime ?? "").trim() || "—";
    case "driverId":
      return String(context.driverId ?? "").trim() || "—";
    case "driverName":
      return String(context.driverName ?? "").trim() || "Unknown";
    case "driverMobile":
      return String(context.driverMobile ?? "").trim() || "—";
    case "eventDescription":
      return String(context.notificationName ?? "").trim() || "—";
    case "eventId":
      return String(context.notificationName ?? context.eventId ?? "").trim() || "—";
    case "eventValue":
      return String(context.eventValue ?? context.actualSpeed ?? "").trim() || "—";
    case "locationName":
      return String(context.locationName ?? "").trim() || "—";
    case "gpsLongitude":
      return Number.isFinite(context.longitude) ? formatLongitude(context.longitude) : "—";
    case "gpsLatitude":
      return Number.isFinite(context.latitude) ? formatLatitude(context.latitude) : "—";
    case "siteName":
      return String(context.siteName ?? "").trim() || "—";
    case "speed":
      return String(context.actualSpeed ?? context.eventValue ?? "").trim() || "—";
    case "vehicleId":
      return String(context.assetId ?? "").trim() || "—";
    default:
      return "—";
  }
}

export function resolveMessageTemplate(message: string, context: DeviceAlertMessageContext): string {
  let result = String(message ?? "");
  for (const token of DEVICE_ALERT_MESSAGE_TOKENS) {
    const value = resolveTokenValue(token.key, context);
    for (const label of tokenLabelsFor(token)) {
      result = result.split(tokenPlaceholder(label)).join(value);
    }
  }
  return result.trim();
}

export type MessagePreviewSegment = {
  type: "token" | "text";
  value: string;
};

export function buildMessagePreviewSegments(
  message: string,
  context: DeviceAlertMessageContext
): MessagePreviewSegment[] {
  const text = String(message ?? "");
  if (!text.trim()) return [];

  const segments: MessagePreviewSegment[] = [];
  const regex = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const literal = text.slice(lastIndex, match.index).trim();
      if (literal) segments.push({ type: "text", value: literal });
    }

    const label = match[1];
    const token = DEVICE_ALERT_MESSAGE_TOKENS.find((entry) => entry.label === label);
    const value = token ? resolveTokenValue(token.key, context) : match[0];
    segments.push({ type: "token", value });
    lastIndex = regex.lastIndex;
  }

  const trailing = text.slice(lastIndex).trim();
  if (trailing) segments.push({ type: "text", value: trailing });

  return segments;
}

export function tokenTableValue(key: string, context: DeviceAlertMessageContext): string {
  if (key === "gpsLatitude") return resolveTokenValue("gpsLatitude", context);
  if (key === "gpsLongitude") return resolveTokenValue("gpsLongitude", context);
  return resolveTokenValue(key, context);
}
