import { getSiteTimeZoneSettings, resolveTimeZoneForSite, type SiteTimeZoneSettings } from "./api";
import { readHomeSiteScope } from "./homeSiteScope";
import { isValidTimeZone } from "./homeTimeline";

const SETTINGS_TTL_MS = 5 * 60_000;
let settingsCache: { atMs: number; value: Promise<SiteTimeZoneSettings | null> } | null = null;

const loadSettings = () => {
  if (!settingsCache || Date.now() - settingsCache.atMs > SETTINGS_TTL_MS) {
    settingsCache = { atMs: Date.now(), value: getSiteTimeZoneSettings().catch(() => null) };
  }
  return settingsCache.value;
};

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * Time zone the Home dashboard uses for day boundaries: the active site's zone
 * (Org Ribbon → Set Timezone), the same one Reports uses, so daily totals match.
 */
export async function resolveHomeTimeZone(): Promise<string> {
  const settings = await loadSettings();
  const site = readHomeSiteScope().scopedSites[0] ?? "";
  const timeZone = resolveTimeZoneForSite(site, settings);
  return isValidTimeZone(timeZone) ? timeZone : browserTimeZone();
}
