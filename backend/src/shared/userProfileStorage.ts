export type UserThemePreference = "light" | "dark";
export type UserMeasurementUnits = "metric" | "imperial";

export type UserProfileRecord = {
  phone: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  employer?: string;
  homeNumber?: string;
  workNumber?: string;
  country?: string;
  language?: string;
  timezone?: string;
  format?: string;
  measurementUnits?: UserMeasurementUnits;
  consumption?: string;
  theme?: UserThemePreference;
  updatedAt?: string;
};

export type UserProfileDetails = {
  firstName: string;
  lastName: string;
  employer: string;
  homeNumber: string;
  workNumber: string;
  country: string;
  language: string;
  timezone: string;
  format: string;
  measurementUnits: UserMeasurementUnits;
  consumption: string;
};

export type ProfileKv = {
  get: (key: string) => Promise<string | null | undefined>;
  put: (key: string, value: string) => Promise<void>;
};

const PROFILE_PREFIX = "vivi:user-profile:";

const DETAIL_KEYS = [
  "firstName",
  "lastName",
  "employer",
  "homeNumber",
  "workNumber",
  "country",
  "language",
  "timezone",
  "format",
  "consumption"
] as const;

type DetailKey = (typeof DETAIL_KEYS)[number];

export function userProfileKvKey(userId: string) {
  return `${PROFILE_PREFIX}${String(userId ?? "").trim()}`;
}

export function normalizeThemePreference(value: unknown): UserThemePreference {
  return String(value ?? "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

export function normalizeMeasurementUnits(value: unknown): UserMeasurementUnits {
  return String(value ?? "").trim().toLowerCase() === "imperial" ? "imperial" : "metric";
}

export function splitDisplayName(name: string): { firstName: string; lastName: string } {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function composeDisplayName(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function optionalText(parsed: Record<string, unknown>, key: string): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(parsed, key)) return undefined;
  return String(parsed[key] ?? "").trim();
}

export function profileDetailsFromRecord(record: UserProfileRecord, fallbackName = ""): UserProfileDetails {
  const split = splitDisplayName(fallbackName);
  const hasStoredName = record.firstName !== undefined || record.lastName !== undefined;
  return {
    firstName: hasStoredName ? String(record.firstName ?? "") : split.firstName,
    lastName: hasStoredName ? String(record.lastName ?? "") : split.lastName,
    employer: String(record.employer ?? ""),
    homeNumber: String(record.homeNumber ?? ""),
    workNumber: String(record.workNumber ?? ""),
    country: String(record.country ?? ""),
    language: String(record.language ?? "").trim() || "en",
    timezone: String(record.timezone ?? ""),
    format: String(record.format ?? "").trim() || "en-GB",
    measurementUnits: record.measurementUnits ? normalizeMeasurementUnits(record.measurementUnits) : "metric",
    consumption: String(record.consumption ?? "")
  };
}

export function buildAuthProfilePayload(input: {
  userId: string;
  email: string;
  fallbackName: string;
  stored: UserProfileRecord;
}) {
  const details = profileDetailsFromRecord(input.stored, input.fallbackName);
  const name = composeDisplayName(details.firstName, details.lastName) || input.fallbackName;
  return {
    userId: input.userId,
    name,
    email: input.email,
    phone: input.stored.phone || "",
    theme: input.stored.theme || "light",
    emailLocked: true,
    canChangePassword: true,
    ...details
  };
}

export function pickProfileDetailsPatch(
  body:
    | (Partial<Record<DetailKey, string | undefined>> & {
        measurementUnits?: string;
      })
    | null
    | undefined
): Partial<UserProfileRecord> {
  if (!body) return {};
  const patch: Partial<UserProfileRecord> = {};
  for (const key of DETAIL_KEYS) {
    if (body[key] !== undefined) {
      patch[key] = String(body[key] ?? "").trim();
    }
  }
  if (body.measurementUnits !== undefined) {
    patch.measurementUnits = normalizeMeasurementUnits(body.measurementUnits);
  }
  return patch;
}

export function resolveComposedName(
  body: { name?: string; firstName?: string; lastName?: string } | null | undefined,
  stored: UserProfileRecord,
  fallbackName: string
): string {
  if (!body) return "";
  if (body.firstName !== undefined || body.lastName !== undefined) {
    const details = profileDetailsFromRecord(stored, fallbackName);
    const first = body.firstName !== undefined ? String(body.firstName).trim() : details.firstName;
    const last = body.lastName !== undefined ? String(body.lastName).trim() : details.lastName;
    return composeDisplayName(first, last);
  }
  return String(body.name ?? "").trim();
}

export async function readUserProfile(kv: ProfileKv, userId: string): Promise<UserProfileRecord> {
  const key = userProfileKvKey(userId);
  let raw: string | null | undefined;
  try {
    raw = await kv.get(key);
  } catch {
    // KV quota / binding failures — return defaults so /auth/profile stays available.
    return { phone: "", theme: "light" };
  }
  if (!raw) return { phone: "", theme: "light" };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const record: UserProfileRecord = {
      phone: String(parsed?.phone ?? "").trim(),
      displayName: String(parsed?.displayName ?? "").trim() || undefined,
      theme: parsed?.theme ? normalizeThemePreference(parsed.theme) : "light",
      updatedAt: String(parsed?.updatedAt ?? "").trim() || undefined
    };
    for (const field of DETAIL_KEYS) {
      const value = optionalText(parsed, field);
      if (value !== undefined) record[field] = value;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "measurementUnits")) {
      record.measurementUnits = normalizeMeasurementUnits(parsed.measurementUnits);
    }
    return record;
  } catch {
    return { phone: "", theme: "light" };
  }
}

export async function writeUserProfile(
  kv: ProfileKv,
  userId: string,
  patch: Partial<UserProfileRecord>
): Promise<UserProfileRecord> {
  const current = await readUserProfile(kv, userId);
  const nameTouched = patch.firstName !== undefined || patch.lastName !== undefined;
  const firstName = patch.firstName !== undefined ? String(patch.firstName ?? "").trim() : current.firstName;
  const lastName = patch.lastName !== undefined ? String(patch.lastName ?? "").trim() : current.lastName;
  const displayName = nameTouched
    ? composeDisplayName(firstName ?? "", lastName ?? "") || undefined
    : patch.displayName !== undefined
      ? String(patch.displayName ?? "").trim() || undefined
      : current.displayName;

  const next: UserProfileRecord = {
    phone: patch.phone !== undefined ? String(patch.phone ?? "").trim() : current.phone,
    theme: patch.theme !== undefined ? normalizeThemePreference(patch.theme) : current.theme ?? "light",
    updatedAt: new Date().toISOString()
  };
  if (displayName) next.displayName = displayName;
  if (firstName !== undefined) next.firstName = firstName;
  if (lastName !== undefined) next.lastName = lastName;

  for (const field of DETAIL_KEYS) {
    if (field === "firstName" || field === "lastName") continue;
    if (patch[field] !== undefined) next[field] = String(patch[field] ?? "").trim();
    else if (current[field] !== undefined) next[field] = current[field];
  }
  if (patch.measurementUnits !== undefined) next.measurementUnits = normalizeMeasurementUnits(patch.measurementUnits);
  else if (current.measurementUnits) next.measurementUnits = current.measurementUnits;

  await kv.put(userProfileKvKey(userId), JSON.stringify(next));
  return next;
}
