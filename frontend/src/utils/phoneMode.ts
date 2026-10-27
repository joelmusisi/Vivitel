export const PHONE_MAX_WIDTH_PX = 768;
const PHONE_PREF_KEY = "vivi.phoneMode";

export function isLikelyNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const maybeCapacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (typeof maybeCapacitor?.isNativePlatform === "function" && maybeCapacitor.isNativePlatform()) {
    return true;
  }
  const protocol = String(window.location?.protocol ?? "").trim().toLowerCase();
  if (protocol === "capacitor:") return true;
  const host = String(window.location?.hostname ?? "").trim().toLowerCase();
  const ua = String(window.navigator?.userAgent ?? "");
  return host === "localhost" && /(android|iphone|ipad|ipod|ios)/i.test(ua);
}

export function isPhoneUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

/** iPad and Android tablets — desktop layout, never the phone shell. */
export function isTabletDevice(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0
): boolean {
  const agent = String(ua ?? "");
  if (/iPad/i.test(agent)) return true;
  if (/Macintosh/i.test(agent) && maxTouchPoints > 1) return true;
  if (/Android/i.test(agent) && !/Mobile/i.test(agent)) return true;
  return false;
}

export function isPhoneViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= PHONE_MAX_WIDTH_PX;
}

/** User forced desktop layout on a phone-sized screen. */
export function isPhoneModeForcedOff(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PHONE_PREF_KEY) === "desktop";
}

export function setPhoneModePreference(mode: "auto" | "desktop"): void {
  if (typeof window === "undefined") return;
  if (mode === "desktop") window.localStorage.setItem(PHONE_PREF_KEY, "desktop");
  else window.localStorage.removeItem(PHONE_PREF_KEY);
}

export function shouldUsePhoneMode(): boolean {
  if (typeof window === "undefined") return false;
  if (isPhoneModeForcedOff()) return false;
  if (isTabletDevice()) return false;
  if (isLikelyNativeShell()) return true;
  return isPhoneUserAgent() && isPhoneViewport();
}

export function phonePostLoginPath(): string {
  return "/";
}

export const POST_LOGIN_PATH_KEY = "vivi.postLoginPath";

const MARKETING_PATH_PREFIXES = [
  "/solutions",
  "/features",
  "/catalog",
  "/company",
  "/business",
  "/contact",
  "/promotions",
  "/support",
  "/stories",
  "/automotive"
];

function isNonAppReturnPath(path: string): boolean {
  if (!path.startsWith("/")) return true;
  if (path === "/" || path === "/login" || path === "/reset-password") return true;
  if (path.startsWith("/share/")) return true;
  return MARKETING_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Persist the app path to restore after logout / session expiry / re-login. */
export function rememberPostLoginPath(fullPath?: string): void {
  if (typeof window === "undefined") return;
  const path = (
    fullPath ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
  ).trim();
  if (isNonAppReturnPath(path)) return;
  try {
    window.localStorage.setItem(POST_LOGIN_PATH_KEY, path);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * The installed native app must sign in before anything (no public marketing bypass).
 * Phone *browsers* may still view the public marketing website; the workspace app
 * routes remain gated by the normal unauthenticated redirect in App.tsx.
 */
export function requiresMandatoryLogin(): boolean {
  return isLikelyNativeShell();
}

export function isPublicAuthPath(pathname: string): boolean {
  const path = String(pathname ?? "").trim();
  if (!path) return false;
  if (path === "/login" || path === "/reset-password") return true;
  return path.startsWith("/share/live/");
}
