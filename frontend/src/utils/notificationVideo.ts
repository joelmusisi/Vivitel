import { notificationRows, NotificationRow } from "../data/notificationLibrary";
import { loadNotificationLibraryItems } from "./notificationLibraryStore";

const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const boolLabelsFromObject = (source: Record<string, unknown>) => {
  const labels: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "boolean" && value) {
      labels.push(titleCase(key));
      continue;
    }
    if (typeof value === "number" && value === 1 && /(ignition|power|moving|movement|alarm|panic|door|charge|tamper|motion)/i.test(key)) {
      labels.push(titleCase(key));
      continue;
    }
    if (typeof value === "string" && /^(true|on|yes|active|moving)$/i.test(value) && /(ignition|power|moving|movement|alarm|panic|door|charge|tamper|motion)/i.test(key)) {
      labels.push(titleCase(key));
    }
  }
  return labels;
};

export const extractNotificationLabelsFromPayload = (data: any) => {
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) out.push(titleCase(text));
  };

  const direct = data?.notifications;
  if (Array.isArray(direct)) direct.forEach(push);
  const alerts = data?.alerts;
  if (Array.isArray(alerts)) alerts.forEach(push);
  push(data?.event);
  push(data?.eventName);
  push(data?.eventType);

  out.push(...boolLabelsFromObject(data ?? {}));
  if (data?.io && typeof data.io === "object") out.push(...boolLabelsFromObject(data.io));
  if (data?.data && typeof data.data === "object") {
    out.push(...boolLabelsFromObject(data.data));
    if (data.data.io && typeof data.data.io === "object") out.push(...boolLabelsFromObject(data.data.io));
  }

  return Array.from(new Set(out)).slice(0, 12);
};

const normalizeVideoEnabledRows = (rows: NotificationRow[]) =>
  rows.filter((row) => Boolean(row.notificationVideo?.enabled)).map((row) => row.description.trim().toLowerCase());

export async function loadVideoEnabledNotificationNames(): Promise<Set<string>> {
  try {
    const items = await loadNotificationLibraryItems();
    if (items.length) return new Set(normalizeVideoEnabledRows(items));
  } catch {
    // fall back to bundled defaults
  }
  return new Set(normalizeVideoEnabledRows(notificationRows));
}

export const hasVideoEnabledNotification = (labels: string[], enabledNames: Set<string>) =>
  labels.some((label) => enabledNames.has(String(label ?? "").trim().toLowerCase()));
