import ExcelJS from "exceljs";

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

export function buildConfigGroupSourceSnapshot(group: {
  notificationBinding?: string;
  locationBinding?: string;
  deviceBinding?: string;
}): ConfigGroupSourceSnapshot {
  return {
    notificationBinding: String(group.notificationBinding ?? "").trim(),
    locationBinding: String(group.locationBinding ?? "").trim(),
    deviceBinding: String(group.deviceBinding ?? "").trim(),
    capturedAt: new Date().toISOString()
  };
}

/** True when linked bindings/libraries changed after the last compile snapshot. */
export function hasConfigurationSourceChanged(group: ConfigGroupChangeInput): boolean {
  const acceptance = group.compileAcceptance;
  const snapshot = acceptance?.sourceSnapshot;
  const compiledAtMs = Date.parse(String(acceptance?.compiledAt ?? ""));
  const updatedAtMs = Date.parse(String(group.updatedAt ?? ""));
  const linkedMs = Date.parse(String(group.linkedSourceUpdatedAt ?? ""));

  if (snapshot) {
    const notificationChanged =
      normalizeBindingRef(group.notificationBinding) !== normalizeBindingRef(snapshot.notificationBinding);
    const locationChanged =
      normalizeBindingRef(group.locationBinding) !== normalizeBindingRef(snapshot.locationBinding);
    const deviceChanged =
      normalizeBindingRef(group.deviceBinding) !== normalizeBindingRef(snapshot.deviceBinding);
    if (notificationChanged || locationChanged || deviceChanged) return true;
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
