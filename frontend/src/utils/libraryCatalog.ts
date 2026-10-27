import { traccarFirmwareProtocols } from "../data/traccarFirmwareProtocols";
import { traccarMobileDevices } from "../data/traccarMobileDevices";
import { loadFromApi } from "./api";

type StoredLibrary = {
  items?: string[];
  hidden?: string[];
  overrides?: Record<string, Partial<{ name: string; availability: string; type?: string }>>;
};

/** Labels from Traccar assets/sites — not mobile device protocols. */
export const isOrgOrSiteMobileLabel = (name: string) => {
  const n = String(name ?? "").trim();
  if (!n) return true;
  const lower = n.toLowerCase();
  if (/dealer/i.test(lower)) return true;
  if (/^(africa|europe|asia|america|oceania)$/i.test(lower)) return true;
  if (/^(west|east|north|south)\s+(africa|europe|asia|america)/i.test(lower)) return true;
  if (/^(transfleet|fleet|region|organisation|organization|site)\b/i.test(lower)) return true;
  if (lower.includes(" - ") && !/\d/.test(n)) return true;
  return false;
};

const normalizeAvailability = (value: string) => {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const lc = v.toLowerCase();
  if (lc === "available") return "Available";
  if (lc === "unavailable" || lc === "un available") return "Unavailable";
  if (lc === "suspended" || lc === "suspend") return "Suspended";
  return v;
};

const isSelectableAvailability = (availability: string) => {
  const v = normalizeAvailability(availability);
  return v !== "Unavailable" && v !== "Suspended";
};

const collectLibraryNames = (
  catalog: string[],
  stored: StoredLibrary | null | undefined
) => {
  const hidden = new Set((Array.isArray(stored?.hidden) ? stored.hidden : []).map((s) => String(s)).filter(Boolean));
  const customItems = (Array.isArray(stored?.items) ? stored.items : []).map((s) => String(s)).filter(Boolean);
  const overrides = stored?.overrides && typeof stored.overrides === "object" ? stored.overrides : {};
  const names = new Set<string>();

  const consider = (key: string) => {
    const trimmedKey = String(key ?? "").trim();
    if (!trimmedKey || isOrgOrSiteMobileLabel(trimmedKey) || hidden.has(trimmedKey)) return;
    const label = String(overrides[trimmedKey]?.name ?? trimmedKey).trim();
    if (!label || isOrgOrSiteMobileLabel(label)) return;
    const availability = normalizeAvailability(String(overrides[trimmedKey]?.availability ?? "Available"));
    if (!isSelectableAvailability(availability)) return;
    names.add(label);
  };

  for (const entry of catalog) consider(entry);
  for (const entry of customItems) consider(entry);

  return Array.from(names).sort((a, b) => a.localeCompare(b));
};

export async function loadMobileDeviceLibraryOptions(): Promise<string[]> {
  const stored = await loadFromApi<StoredLibrary>("libraries:mobile-devices");
  return collectLibraryNames(traccarMobileDevices, stored);
}

export async function loadFirmwareLibraryOptions(): Promise<string[]> {
  const stored = await loadFromApi<StoredLibrary>("libraries:firmware");
  return collectLibraryNames(traccarFirmwareProtocols, stored);
}

/** Device type → model list for Assets device/model selects. */
export const mergeCatalogOption = (options: string[], value: string) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return options;
  if (options.some((item) => item.trim().toLowerCase() === trimmed.toLowerCase())) return options;
  return [...options, trimmed].sort((a, b) => a.localeCompare(b));
};

export function buildDeviceModelMap(deviceNames: string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const name of deviceNames) {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) continue;
    map[trimmed] = [trimmed];
  }
  return map;
}
