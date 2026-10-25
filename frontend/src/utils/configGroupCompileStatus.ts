import ExcelJS from "exceljs";
import {
  resolveMonitoredEventDescription,
  toCanonicalNotificationDescription
} from "../data/notificationLibrary";
import { resolveBindingByRef } from "./bindingResolve";

export type ConfigGroupAssetCompileOutcome = {
  assetKey: string;
  label: string;
  imei: string;
  registration: string;
  accepted: boolean;
  error?: string;
  compiledAt?: string;
};

/** Binding refs captured when a group was last compiled — used to detect later library/binding edits. */
export type ConfigGroupSourceSnapshot = {
  notificationBinding?: string;
  locationBinding?: string;
  deviceBinding?: string;
  capturedAt?: string;
  /** Hash of everything compiled to the device (bindings + monitored notification parameters). */
  fingerprint?: string;
};

export type ConfigGroupCompileAcceptance = {
  compiledAt?: string;
  acceptedCount: number;
  totalCount: number;
  assets: ConfigGroupAssetCompileOutcome[];
  /** Binding refs at compile time; when they drift, Configuration Change → Configurations Changed. */
  sourceSnapshot?: ConfigGroupSourceSnapshot;
};

/** Per-asset / group configuration delivery statuses on the configuration groups page. */
export const CONFIGURATION_STATUS = {
  ACCEPTED: "Configurations Accepted",
  FAILED: "Configurations Failed",
  UPLOAD_REQUESTED: "Upload Requested"
} as const;

/** Values shown in the Config Compile Status column (blank when fully accepted with no pending edits). */
export const CONFIGURATION_CHANGE = {
  CHANGED: "Configurations Changed",
  UPLOAD_REQUESTED: "Upload Requested"
} as const;

export type ConfigurationStatusLabel =
  (typeof CONFIGURATION_STATUS)[keyof typeof CONFIGURATION_STATUS];

export type ConfigurationChangeLabel =
  | (typeof CONFIGURATION_CHANGE)[keyof typeof CONFIGURATION_CHANGE]
  | "";

export const CONFIGURATION_RECEIVED_NOTE = "Configurations Received";

export type ConfigGroupChangeInput = {
  notificationBinding?: string;
  locationBinding?: string;
  deviceBinding?: string;
  updatedAt?: string;
  /** Latest known update time of linked bindings / library rows. */
  linkedSourceUpdatedAt?: string;
  /** Fingerprint of the group's current binding sources; compared with sourceSnapshot.fingerprint. */
  currentSourceFingerprint?: string;
  compileAcceptance?: ConfigGroupCompileAcceptance;
};

/** Transport / Traccar-proxy noise that must not flip an otherwise accepted compile. */
export function isBlockingCompileError(message: string): boolean {
  const text = String(message ?? "").trim();
  if (!text) return false;
  if (
    /traccar|upstream unavailable|soft.?fail|null body|http2|protocol|timeout|network|unreachable|temporarily unreachable/i.test(
      text
    )
  ) {
    return false;
  }
  if (/notification\s+\d+|attribute\s+\d+|site group assignment/i.test(text)) {
    return false;
  }
  return true;
}

export function configurationGroupCompileSucceeded(params: {
  acceptedCount: number;
  assetsInGroup: number;
  errors?: string[];
}): boolean {
  const accepted = Math.max(0, Number(params.acceptedCount ?? 0));
  const total = Math.max(0, Number(params.assetsInGroup ?? 0));
  if (accepted < total || total <= 0) return false;
  return !(params.errors ?? []).some((row) => isBlockingCompileError(row));
}

export const buildConfigGroupCompileAcceptance = (
  outcomes: ConfigGroupAssetCompileOutcome[],
  totalCount: number,
  sourceSnapshot?: ConfigGroupSourceSnapshot
): ConfigGroupCompileAcceptance => {
  const acceptedCount = outcomes.filter((row) => row.accepted).length;
  return {
    compiledAt: new Date().toISOString(),
    acceptedCount,
    totalCount,
    assets: outcomes,
    ...(sourceSnapshot ? { sourceSnapshot } : {})
  };
};

export function assetConfigurationStatus(
  row: Pick<ConfigGroupAssetCompileOutcome, "accepted" | "error"> | undefined
): ConfigurationStatusLabel {
  if (!row) return CONFIGURATION_STATUS.UPLOAD_REQUESTED;
  if (row.accepted) return CONFIGURATION_STATUS.ACCEPTED;
  if (String(row.error ?? "").trim()) return CONFIGURATION_STATUS.FAILED;
  return CONFIGURATION_STATUS.UPLOAD_REQUESTED;
}

export function groupConfigurationStatus(
  acceptance: ConfigGroupCompileAcceptance | undefined,
  assignedTotal: number
): ConfigurationStatusLabel {
  const total = Math.max(assignedTotal, acceptance?.totalCount ?? 0);
  if (!acceptance?.compiledAt || total <= 0) return CONFIGURATION_STATUS.UPLOAD_REQUESTED;

  const assets = acceptance.assets ?? [];
  const accepted = acceptance.acceptedCount ?? assets.filter((row) => row.accepted).length;
  if (accepted >= total && total > 0) return CONFIGURATION_STATUS.ACCEPTED;

  const anyFailed = assets.some((row) => !row.accepted && String(row.error ?? "").trim());
  if (anyFailed) return CONFIGURATION_STATUS.FAILED;

  return CONFIGURATION_STATUS.UPLOAD_REQUESTED;
}

export const configuredCountLabel = (acceptance: ConfigGroupCompileAcceptance | undefined, assignedTotal: number) => {
  const total = Math.max(assignedTotal, acceptance?.totalCount ?? 0);
  const accepted = acceptance?.acceptedCount ?? 0;
  return `${accepted}/${total}`;
};

export function configurationStatusCellLabel(
  acceptance: ConfigGroupCompileAcceptance | undefined,
  assignedTotal: number
): string {
  const status = groupConfigurationStatus(acceptance, assignedTotal);
  const count = configuredCountLabel(acceptance, assignedTotal);
  return `${status} (${count})`;
}

const normalizeBindingRef = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function buildConfigGroupSourceSnapshot(
  group: {
    notificationBinding?: string;
    locationBinding?: string;
    deviceBinding?: string;
  },
  fingerprint?: string
): ConfigGroupSourceSnapshot {
  return {
    notificationBinding: String(group.notificationBinding ?? "").trim(),
    locationBinding: String(group.locationBinding ?? "").trim(),
    deviceBinding: String(group.deviceBinding ?? "").trim(),
    capturedAt: new Date().toISOString(),
    ...(fingerprint ? { fingerprint } : {})
  };
}

type SourceBindingRow = { id?: string; name?: string; site?: string; [key: string]: unknown };

/** Binding + notification library rows a group's compile reads from. */
export type ConfigGroupSourceRecords = {
  notificationBindings: SourceBindingRow[];
  locationBindings: SourceBindingRow[];
  deviceBindings: SourceBindingRow[];
  /** Notification library rows for the group's site. */
  libraryItems: Array<{ description?: string; type?: string; [key: string]: unknown }>;
};

/** Bookkeeping fields that never reach the device (ids, counts, timestamps, Traccar caches). */
const FINGERPRINT_IGNORED_KEYS = new Set([
  "id",
  "site",
  "tenantId",
  "tenant_id",
  "updatedAt",
  "updated_at",
  "createdAt",
  "created_at",
  "assetCount",
  "groupCount",
  "advancedConfirmed",
  "eventId",
  "traccarNotificationId",
  "traccarComputedAttributeId"
]);

/** Canonical value: sorted keys, primitives as strings, empty values dropped. */
const canonicalFingerprintValue = (value: unknown): unknown => {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(canonicalFingerprintValue).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (FINGERPRINT_IGNORED_KEYS.has(key)) continue;
      const next = canonicalFingerprintValue((value as Record<string, unknown>)[key]);
      if (next !== undefined) out[key] = next;
    }
    return Object.keys(out).length ? out : undefined;
  }
  const text = String(value).trim();
  return text ? text : undefined;
};

/** cyrb53 - short, stable, non-cryptographic hash. */
const hashFingerprintText = (text: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

const findSourceLibraryItem = (items: ConfigGroupSourceRecords["libraryItems"], description: string) => {
  const resolved = resolveMonitoredEventDescription(items, description);
  if (resolved) return items.find((row) => String(row.description ?? "").trim() === resolved) ?? null;
  const key = normalizeBindingRef(toCanonicalNotificationDescription(description));
  return (
    items.find(
      (row) => normalizeBindingRef(toCanonicalNotificationDescription(String(row.description ?? ""))) === key
    ) ?? null
  );
};

/**
 * Stable fingerprint of everything a configuration group compiles to its devices:
 * binding names, device/location parameters, and each monitored notification's library parameters.
 * Missing bindings fingerprint as their ref so attaching / detaching / renaming always changes it.
 */
export function buildConfigGroupSourceFingerprint(
  group: { site?: string; notificationBinding?: string; locationBinding?: string; deviceBinding?: string },
  sources: ConfigGroupSourceRecords
): string {
  const site = String(group.site ?? "").trim();
  const resolve = (rows: SourceBindingRow[], ref: unknown) => {
    const needle = String(ref ?? "").trim();
    if (!needle) return null;
    const binding = resolveBindingByRef(rows ?? [], needle, site);
    return binding ? canonicalFingerprintValue(binding) ?? {} : { missing: normalizeBindingRef(needle) };
  };

  let notification: unknown = null;
  const notificationRef = String(group.notificationBinding ?? "").trim();
  if (notificationRef) {
    const binding = resolveBindingByRef(sources.notificationBindings ?? [], notificationRef, site);
    if (!binding) {
      notification = { missing: normalizeBindingRef(notificationRef) };
    } else {
      const monitored = Array.isArray(binding.monitoredEvents) ? (binding.monitoredEvents as unknown[]) : [];
      const byKey = new Map<string, unknown>();
      for (const raw of monitored) {
        const description = String(raw ?? "").trim();
        if (!description) continue;
        const item = findSourceLibraryItem(sources.libraryItems ?? [], description);
        const key = item
          ? String(item.description ?? "").trim()
          : `missing:${normalizeBindingRef(toCanonicalNotificationDescription(description))}`;
        byKey.set(key, item ? canonicalFingerprintValue(item) ?? {} : { missing: key });
      }
      const { monitoredEvents: _monitored, ...rest } = binding;
      notification = {
        binding: canonicalFingerprintValue(rest) ?? {},
        notifications: [...byKey.keys()].sort().map((key) => byKey.get(key))
      };
    }
  }

  const payload = {
    site: normalizeBindingRef(site),
    notification,
    location: resolve(sources.locationBindings, group.locationBinding),
    device: resolve(sources.deviceBindings, group.deviceBinding)
  };
  return hashFingerprintText(JSON.stringify(payload));
}

/** True when linked bindings/libraries changed after the last compile snapshot. */
export function hasConfigurationSourceChanged(group: ConfigGroupChangeInput): boolean {
  const acceptance = group.compileAcceptance;
  const snapshot = acceptance?.sourceSnapshot;
  const compiledAtMs = Date.parse(String(acceptance?.compiledAt ?? ""));
  const updatedAtMs = Date.parse(String(group.updatedAt ?? ""));
  const linkedMs = Date.parse(String(group.linkedSourceUpdatedAt ?? ""));

  // Content fingerprint is authoritative: it catches renames, parameter edits and notification
  // list changes, and ignores saves that changed nothing (unlike updatedAt timestamps).
  const currentFingerprint = String(group.currentSourceFingerprint ?? "").trim();
  const snapshotFingerprint = String(snapshot?.fingerprint ?? "").trim();

  if (snapshot) {
    const notificationChanged =
      normalizeBindingRef(group.notificationBinding) !== normalizeBindingRef(snapshot.notificationBinding);
    const locationChanged =
      normalizeBindingRef(group.locationBinding) !== normalizeBindingRef(snapshot.locationBinding);
    const deviceChanged =
      normalizeBindingRef(group.deviceBinding) !== normalizeBindingRef(snapshot.deviceBinding);
    if (notificationChanged || locationChanged || deviceChanged) return true;
  }

  if (snapshotFingerprint) {
    // Sources not loaded yet: wait for them rather than guessing from timestamps.
    return Boolean(currentFingerprint) && currentFingerprint !== snapshotFingerprint;
  }

  if (Number.isFinite(compiledAtMs)) {
    if (Number.isFinite(updatedAtMs) && updatedAtMs > compiledAtMs + 1000) return true;
    if (Number.isFinite(linkedMs) && linkedMs > compiledAtMs + 1000) return true;
  }

  return false;
}

/**
 * Configuration Change column:
 * - Configurations Changed — libraries/bindings adjusted since last compile
 * - blank — configurations fully accepted and unchanged
 * - Upload Requested — assets still pending acceptance
 */
export function configurationChangeLabel(
  group: ConfigGroupChangeInput,
  assignedTotal: number
): ConfigurationChangeLabel {
  if (hasConfigurationSourceChanged(group)) return CONFIGURATION_CHANGE.CHANGED;
  const status = groupConfigurationStatus(group.compileAcceptance, assignedTotal);
  if (status === CONFIGURATION_STATUS.ACCEPTED) return "";
  return CONFIGURATION_CHANGE.UPLOAD_REQUESTED;
}

/** Date shown for the last configuration change / compile. */
export function configurationDateLabel(group: ConfigGroupChangeInput): string {
  const candidates = [
    group.linkedSourceUpdatedAt,
    group.updatedAt,
    group.compileAcceptance?.sourceSnapshot?.capturedAt,
    group.compileAcceptance?.compiledAt
  ];
  let bestMs = Number.NaN;
  let bestIso = "";
  for (const value of candidates) {
    const iso = String(value ?? "").trim();
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (!Number.isFinite(bestMs) || ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  if (!bestIso) return "";
  try {
    return new Date(bestIso).toLocaleString();
  } catch {
    return bestIso;
  }
}

export async function downloadConfigGroupCompileExcel(
  groupName: string,
  acceptance: ConfigGroupCompileAcceptance
): Promise<void> {
  const { addBrandedSheetHeader, loadExportLogo, resolveExportScope, writeExportWorkbookBuffer } = await import("./exportBranding");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Configuration status", { views: [{ showGridLines: false }] });
  const safeName = String(groupName ?? "configuration_group").trim() || "configuration_group";
  const scope = await resolveExportScope();
  const top = addBrandedSheetHeader(workbook, sheet, {
    title: `Configuration status – ${safeName}`,
    scope,
    logoDataUrl: await loadExportLogo(),
    columnCount: 6
  });
  const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
  const boxed = (row: ExcelJS.Row) =>
    row.eachCell((cell) => {
      const text = String(cell.value ?? "").trim();
      if (text && text !== "—") cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });

  const summaryRows = [
    sheet.addRow(["Configuration group", safeName]),
    sheet.addRow(["Compiled at", acceptance.compiledAt ? new Date(acceptance.compiledAt).toLocaleString() : "—"]),
    sheet.addRow(["Accepted", acceptance.acceptedCount]),
    sheet.addRow(["Assigned assets", acceptance.totalCount])
  ];
  summaryRows.forEach(boxed);
  sheet.addRow([]);
  const headerRow = sheet.addRow(["Asset", "Registration", "IMEI", "Configuration status", "Note", "Details"]);
  headerRow.font = { bold: true };
  boxed(headerRow);

  for (const row of acceptance.assets) {
    const status = assetConfigurationStatus(row);
    boxed(sheet.addRow([
      row.label,
      row.registration || "—",
      row.imei || "—",
      status,
      row.accepted ? CONFIGURATION_RECEIVED_NOTE : "",
      row.error ?? ""
    ]));
  }
  void top;
  sheet.columns = [
    { width: 28 },
    { width: 18 },
    { width: 20 },
    { width: 24 },
    { width: 24 },
    { width: 42 }
  ];

  const buffer = await writeExportWorkbookBuffer(workbook);
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName.replace(/[^\w.-]+/g, "_")}_configuration_status.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
