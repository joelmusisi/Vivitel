/**
 * Maps VIVI Telematics hierarchy labels to Traccar device fields.
 *
 * | VIVI (app)     | Traccar device field |
 * |----------------|----------------------|
 * | Organisation   | model                |
 * | Dealer         | contact              |
 * | Database       | phone                |
 * | Site           | group (groupId)      |
 *
 * Ribbon path order is: Dealer / Organisation / Database / Site.
 */

export type ViviHierarchyLabels = {
  organisation: string;
  dealer: string;
  database: string;
  site: string;
};

export const TRACCAR_VIVI_FIELD_LABELS = {
  traccarGroup: "Site",
  traccarPhone: "Database",
  traccarModel: "Organisation",
  traccarContact: "Dealer"
} as const;

/** Split ribbon path segments (supports ` / ` and `/`). */
export const parseViviSelectedPath = (path: string): string[] =>
  String(path ?? "")
    .split(/\s*\/\s*/)
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

/** Path order: Dealer / Organisation / Database / Site. */
export const hierarchyLabelsFromSelectedPath = (path: string): ViviHierarchyLabels => {
  const parts = parseViviSelectedPath(path);
  return {
    dealer: parts[0] ?? "",
    organisation: parts[1] ?? "",
    database: parts[2] ?? "",
    site: parts[3] ?? ""
  };
};

type AssetLike = Record<string, unknown>;

const usesCanonicalHierarchyFields = (asset: AssetLike) =>
  String(asset.hierarchyNamingVersion ?? "").trim() === "2";

const normalizeLabel = (value: unknown) => String(value ?? "").trim().toLowerCase();

/**
 * True when a Phone/Database value is actually a configuration or Traccar group name
 * that was incorrectly written into Database / Phone.
 */
export const looksLikeMisplacedDatabaseLabel = (
  value: string,
  extras?: { knownGroupNames?: Iterable<string> }
): boolean => {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const needle = normalizeLabel(raw);

  if (
    needle === "default" ||
    needle === "default-group" ||
    needle === "default group" ||
    needle === "auto-created for asset import"
  ) {
    return true;
  }

  if (
    /grpoup|do[_ ]?not[_ ]?ch[an]nge|_test_group$|trial_group|fuel_test_group/i.test(raw) ||
    /_group$/i.test(raw) ||
    /\bgroups?\b/i.test(raw)
  ) {
    return true;
  }

  if (extras?.knownGroupNames) {
    for (const name of extras.knownGroupNames) {
      if (needle && needle === normalizeLabel(name)) return true;
    }
  }

  return false;
};

/**
 * Configuration group must never be written to Traccar Phone (Database).
 * Older saves incorrectly used configGroup as database via `database ?? configGroup`.
 */
export const resolveAssetDatabaseLabel = (
  asset: AssetLike,
  extras?: { knownGroupNames?: Iterable<string> }
): string => {
  const database = String(asset.database ?? "").trim();
  if (!database) return "";
  const configGroupId = String(asset.configGroup ?? "").trim();
  const configGroupName = String((asset as any).configurationGroup ?? "").trim();
  const needle = normalizeLabel(database);
  if (needle && (needle === normalizeLabel(configGroupId) || needle === normalizeLabel(configGroupName))) {
    return "";
  }
  if (looksLikeMisplacedDatabaseLabel(database, extras)) {
    return "";
  }
  return database;
};

/**
 * Read hierarchy labels from a stored asset.
 * Legacy rows (before v2) stored organisation in `dealer` and dealer in `organisation`.
 */
export const resolveViviHierarchyFromAsset = (
  asset: AssetLike,
  extras?: { knownGroupNames?: Iterable<string> }
): ViviHierarchyLabels => {
  const database = resolveAssetDatabaseLabel(asset, extras);
  const site = String(asset.site ?? "").trim();

  if (usesCanonicalHierarchyFields(asset)) {
    return {
      organisation: String(asset.organisation ?? "").trim(),
      dealer: String(asset.dealer ?? "").trim(),
      database,
      site
    };
  }

  return {
    organisation: String(asset.dealer ?? asset.organisation ?? "").trim(),
    dealer: String(asset.organisation ?? asset.dealer ?? "").trim(),
    database,
    site
  };
};

export type TraccarDeviceHierarchyFields = {
  model?: string;
  contact?: string;
  phone?: string;
};

/** Build Traccar device hierarchy fields from VIVI labels. Phone is always set (Database, or "" to clear). */
export const buildTraccarDeviceHierarchyFields = (
  labels: ViviHierarchyLabels
): TraccarDeviceHierarchyFields => {
  const fields: TraccarDeviceHierarchyFields = {
    phone: String(labels.database ?? "").trim()
  };
  const organisation = String(labels.organisation ?? "").trim();
  const dealer = String(labels.dealer ?? "").trim();
  if (organisation) fields.model = organisation;
  if (dealer) fields.contact = dealer;
  return fields;
};

/** Teltonika / tracker SKUs that must not be treated as Organisation names. */
export const looksLikeTrackerDeviceModel = (value: string): boolean => {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return /^(FMB|FMC|FMX|FMT|FMM|FMU|GH|MTB|GV|TK|ST\d)/i.test(raw);
};

export type TraccarDeviceLike = {
  id?: number | string;
  name?: string;
  uniqueId?: string;
  groupId?: number | string;
  model?: string;
  contact?: string;
  phone?: string;
  category?: string;
};

/**
 * Reverse-map a Traccar device into VIVI hierarchy + optional hardware model.
 * Group name → Site, contact → Dealer, phone → Database, model → Organisation
 * (unless model looks like a tracker SKU such as FMB130 — then it becomes device model).
 */
export const resolveViviFieldsFromTraccarDevice = (
  device: TraccarDeviceLike,
  groupNameById: Map<number, string>
): ViviHierarchyLabels & { deviceModel: string } => {
  const groupId = Number(device.groupId ?? 0);
  const site =
    Number.isFinite(groupId) && groupId > 0 ? String(groupNameById.get(groupId) ?? "").trim() : "";
  const dealer = String(device.contact ?? "").trim();
  const rawPhone = String(device.phone ?? "").trim();
  const knownGroupNames = groupNameById.values();
  const database = looksLikeMisplacedDatabaseLabel(rawPhone, { knownGroupNames }) ? "" : rawPhone;
  const traccarModel = String(device.model ?? "").trim();
  const isDeviceSku = looksLikeTrackerDeviceModel(traccarModel);
  return {
    site,
    dealer,
    database,
    organisation: isDeviceSku ? "" : traccarModel,
    deviceModel: isDeviceSku ? traccarModel : String(device.category ?? "").trim()
  };
};
