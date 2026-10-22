export type TimelineRowKey = string;

export type TimelineRowRenderMode = "continuous" | "discrete";

export type TimelineRowDefinition = {
  key: TimelineRowKey;
  label: string;
  markerVariant: "speed" | "idle" | "harsh" | "ignition-on" | "ignition-off" | "generic";
  renderMode: TimelineRowRenderMode;
  libraryLabels: string[];
};

export const TIMELINE_ROW_ORDER: TimelineRowDefinition[] = [
  {
    key: "green-band",
    label: "Out of green band driving",
    markerVariant: "generic",
    renderMode: "continuous",
    libraryLabels: ["Out of green band driving", "Extended Trip - Green Band"]
  },
  {
    key: "over-rev",
    label: "Over revving",
    markerVariant: "generic",
    renderMode: "continuous",
    libraryLabels: ["Over revving", "Over revving - WARNING"]
  },
  {
    key: "overspeed",
    label: "Over speeding",
    markerVariant: "speed",
    renderMode: "discrete",
    libraryLabels: ["Over speeding", "Over Speeding Pre-Warning", "Speed limit exceeded"]
  },
  {
    key: "idle-excessive",
    label: "Idle - excessive",
    markerVariant: "idle",
    renderMode: "continuous",
    libraryLabels: ["Idle - excessive", "Excessive idle", "Idle"]
  },
  {
    key: "harsh-braking",
    label: "Harsh braking",
    markerVariant: "harsh",
    renderMode: "discrete",
    libraryLabels: ["Harsh braking", "Harsh Braking (excessive)", "Harsh braking - WARNING"]
  },
  {
    key: "harsh-acceleration",
    label: "Harsh acceleration",
    markerVariant: "harsh",
    renderMode: "discrete",
    libraryLabels: ["Harsh acceleration", "Harsh Acceleration (excessive)", "Harsh acceleration - WARNING"]
  },
  {
    key: "ignition-off",
    label: "* Ignition Off",
    markerVariant: "ignition-off",
    renderMode: "discrete",
    libraryLabels: ["Ignition Off", "Ignition off"]
  },
  {
    key: "ignition-on",
    label: "* Ignition On",
    markerVariant: "ignition-on",
    renderMode: "discrete",
    libraryLabels: ["Ignition On", "Ignition on"]
  }
];

/** Hour/minute ranges start at the anchor. Day ranges end at the end of the anchor day and look backward. */
export function timelineWindowFromAnchor(anchor: Date, range: string, offsetHours = 0): { startMs: number; endMs: number } {
  const span = rangeToMilliseconds(range);
  const rounded = new Date(anchor.getTime());
  if (Number.isNaN(rounded.getTime())) {
    const endMs = Date.now();
    return { startMs: endMs - span, endMs };
  }
  rounded.setMinutes(0, 0, 0);
  rounded.setHours(rounded.getHours() + offsetHours);
  if (/d$/i.test(String(range ?? "").trim())) {
    const endMs = rounded.getTime() + 24 * 60 * 60 * 1000;
    return { startMs: endMs - span, endMs };
  }
  return { startMs: rounded.getTime(), endMs: rounded.getTime() + span };
}

export function rangeToMilliseconds(range: string): number {
  const trimmed = String(range ?? "").trim().toLowerCase();
  if (trimmed.endsWith("m")) {
    const minutes = Number(trimmed.replace("m", ""));
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : 24 * 60 * 60 * 1000;
  }
  if (trimmed.endsWith("h")) {
    const hours = Number(trimmed.replace("h", ""));
    return Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  }
  if (trimmed.endsWith("d")) {
    const days = Number(trimmed.replace("d", ""));
    return Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  }
  return 24 * 60 * 60 * 1000;
}

const normalize = (value: string) =>
  String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function matchNotificationNameToTimelineRow(name: string): TimelineRowKey | null {
  const normalized = normalize(name);
  if (!normalized) return null;
  const compact = normalized.replace(/\s/g, "");
  // US Traccar report types → fixed timeline lanes
  if (compact === "deviceoverspeed" || compact === "overspeed") return "overspeed";
  if (compact === "ignitionon") return "ignition-on";
  if (compact === "ignitionoff") return "ignition-off";
  if (compact === "idling" || compact === "idleexcessive") return "idle-excessive";
  if (compact === "harshbraking") return "harsh-braking";
  if (compact === "harshacceleration") return "harsh-acceleration";
  if (compact === "overrevving") return "over-rev";
  if (compact === "greenband") return "green-band";
  for (const row of TIMELINE_ROW_ORDER) {
    for (const label of row.libraryLabels) {
      const target = normalize(label);
      if (normalized === target || normalized.includes(target) || target.includes(normalized)) {
        return row.key;
      }
    }
    if (row.key === "ignition-off" && normalized.includes("ignition") && /\boff\b/.test(normalized)) return row.key;
    if (row.key === "ignition-on" && normalized.includes("ignition") && /\bon\b/.test(normalized)) return row.key;
    if (row.key === "overspeed" && (normalized.includes("overspeed") || normalized.includes("over speeding") || normalized.includes("speed limit"))) {
      return row.key;
    }
  }
  return null;
}

export function customTimelineRowKey(notificationId: string): TimelineRowKey {
  return `custom-${String(notificationId ?? "").trim()}`;
}

export function buildNotificationIdToRowKey(
  notifications: Array<{ id: string; name: string }>
): Map<string, TimelineRowKey> {
  const map = new Map<string, TimelineRowKey>();
  for (const notif of notifications) {
    const rowKey = matchNotificationNameToTimelineRow(notif.name) ?? customTimelineRowKey(notif.id);
    map.set(notif.id, rowKey);
  }
  return map;
}

/** Lanes for every selected notification — known rows keep order; others get a discrete custom lane. */
export function buildVisibleTimelineRows(
  selectedIds: string[],
  notifications: Array<{ id: string; name: string }>
): TimelineRowDefinition[] {
  const idToRow = buildNotificationIdToRowKey(notifications);
  const nameById = new Map(notifications.map((n) => [n.id, n.name]));
  const knownKeys = new Set<TimelineRowKey>();
  const customRows: TimelineRowDefinition[] = [];
  const seenCustom = new Set<TimelineRowKey>();

  for (const id of selectedIds) {
    const rowKey = idToRow.get(id) ?? customTimelineRowKey(id);
    const known = TIMELINE_ROW_ORDER.find((row) => row.key === rowKey);
    if (known) {
      knownKeys.add(known.key);
      continue;
    }
    if (seenCustom.has(rowKey)) continue;
    seenCustom.add(rowKey);
    const label = nameById.get(id) || `Notification ${id}`;
    customRows.push({
      key: rowKey,
      label,
      markerVariant: "generic",
      renderMode: "discrete",
      libraryLabels: [label]
    });
  }

  return [
    ...TIMELINE_ROW_ORDER.filter((row) => knownKeys.has(row.key)),
    ...customRows
  ];
}
