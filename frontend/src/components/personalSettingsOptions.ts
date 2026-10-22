export type RegionalFormat = {
  id: string;
  label: string;
  date: string;
  time: string;
  number: string;
};

export const REGIONAL_FORMATS: RegionalFormat[] = [
  { id: "en-GB", label: "English (United Kingdom)", date: "dd/MM/yyyy", time: "00:00 - 23:59", number: "1,234,567.89" },
  { id: "en-US", label: "English (United States)", date: "MM/dd/yyyy", time: "12:00 AM - 11:59 PM", number: "1,234,567.89" },
  { id: "en-ZA", label: "English (South Africa)", date: "yyyy/MM/dd", time: "00:00 - 23:59", number: "1 234 567,89" },
  { id: "fr-FR", label: "French (France)", date: "dd/MM/yyyy", time: "00:00 - 23:59", number: "1 234 567,89" },
  { id: "pt-PT", label: "Portuguese (Portugal)", date: "dd/MM/yyyy", time: "00:00 - 23:59", number: "1 234 567,89" },
  { id: "sw-KE", label: "Swahili (Kenya)", date: "dd/MM/yyyy", time: "00:00 - 23:59", number: "1,234,567.89" },
  { id: "ar-EG", label: "Arabic (Egypt)", date: "dd/MM/yyyy", time: "00:00 - 23:59", number: "1,234,567.89" },
  { id: "de-DE", label: "German (Germany)", date: "dd.MM.yyyy", time: "00:00 - 23:59", number: "1.234.567,89" }
];

export const LANGUAGE_OPTIONS = [
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "pt", label: "Portuguese" },
  { id: "es", label: "Spanish" },
  { id: "sw", label: "Swahili" },
  { id: "ar", label: "Arabic" },
  { id: "de", label: "German" },
  { id: "zh", label: "Chinese" }
];

export const CONSUMPTION_OPTIONS = [
  { id: "km/l", label: "km/l" },
  { id: "l/100km", label: "l/100km" },
  { id: "mpg", label: "mpg (US)" },
  { id: "mpg-uk", label: "mpg (UK)" }
];

const COUNTRY_CODES = [
  "AF", "AL", "DZ", "AD", "AO", "AG", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ",
  "BJ", "BT", "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "CF", "TD", "CL", "CN",
  "CO", "KM", "CG", "CD", "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ",
  "ER", "EE", "SZ", "ET", "FJ", "FI", "FR", "GA", "GM", "GE", "DE", "GH", "GR", "GD", "GT", "GN", "GW", "GY",
  "HT", "HN", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI", "KW",
  "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MR",
  "MU", "MX", "FM", "MD", "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NZ", "NI", "NE", "NG",
  "KP", "MK", "NO", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PH", "PL", "PT", "QA", "RO", "RU", "RW", "KN",
  "LC", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO", "ZA", "KR", "SS",
  "ES", "LK", "SD", "SR", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TO", "TT", "TN", "TR", "TM",
  "TV", "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VU", "VE", "VN", "YE", "ZM", "ZW"
];

export type LabeledOption = { id: string; label: string };

export function listCountries(): LabeledOption[] {
  const names = typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
  return COUNTRY_CODES.map((code) => ({
    id: code,
    label: names?.of(code) || code
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export function timezoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
      hour: "2-digit"
    }).formatToParts(new Date());
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "UTC";
    const offset = raw.replace(/^GMT/, "UTC");
    const city = timeZone.split("/").slice(1).join(", ").replace(/_/g, " ") || timeZone;
    return `(${offset}) ${city}`;
  } catch {
    return timeZone;
  }
}

const FALLBACK_TIMEZONES = [
  "Africa/Kampala",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "Asia/Dubai",
  "UTC"
];

export function listTimezones(): LabeledOption[] {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  }).supportedValuesOf;
  const supported = typeof supportedValuesOf === "function"
    ? supportedValuesOf.call(Intl, "timeZone")
    : FALLBACK_TIMEZONES;
  const zones = supported.filter((zone) => zone === "UTC" || (zone.includes("/") && !zone.startsWith("Etc/")));
  return zones
    .map((id) => ({ id, label: id === "UTC" ? "(UTC+00:00) UTC" : timezoneLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
