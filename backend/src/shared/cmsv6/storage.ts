import { buildScopedKvKey } from "../scopeIsolation";

export const CMSV6_KV_BASE = "platform:cmsv6";

export type Cmsv6AuthMode = "sso" | "password";

export type Cmsv6PlatformConfig = {
  site: string;
  enabled: boolean;
  authMode: Cmsv6AuthMode;
  baseUrl: string;
  account: string;
  password: string;
  jsession?: string;
  language: string;
  mediaHost: string;
  mediaPort: number;
  toMap: number;
  positioningProtocol: string;
  videoProtocol: string;
  updatedAt?: string;
};

export const CMSV6_DEFAULT_CONFIG: Cmsv6PlatformConfig = {
  site: "",
  enabled: false,
  authMode: "sso",
  baseUrl: "https://gps.hboiot.com:8088",
  account: "",
  password: "",
  jsession: "",
  language: "en",
  mediaHost: "gps.hboiot.com",
  mediaPort: 6603,
  toMap: 2,
  positioningProtocol: "JT/T808",
  videoProtocol: "JT/T1078"
};

export function cmsv6ConfigKey(tenantId: string, siteName: string) {
  return buildScopedKvKey(CMSV6_KV_BASE, tenantId, siteName);
}

export function cmsv6SsoSessionKey(tenantId: string, siteName: string, userId: string) {
  const userToken = String(userId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "session";
  return `${cmsv6ConfigKey(tenantId, siteName)}:sso:${userToken}`;
}

export function publicCmsv6Config(config: Cmsv6PlatformConfig | null) {
  if (!config) {
    return { ...CMSV6_DEFAULT_CONFIG, password: "", jsession: "", passwordSet: false, sessionSet: false, authMode: "sso" };
  }
  return {
    ...config,
    password: "",
    jsession: "",
    authMode: config.authMode || "sso",
    passwordSet: Boolean(String(config.password ?? "").trim()),
    sessionSet: Boolean(String(config.jsession ?? "").trim())
  };
}

export function normalizeCmsv6Config(input: Record<string, unknown>, previous?: Cmsv6PlatformConfig | null): Cmsv6PlatformConfig {
  const nextPassword = String(input.password ?? "").trim();
  const nextSession = String(input.jsession ?? "").trim();
  const mediaPort = Number(input.mediaPort ?? previous?.mediaPort ?? CMSV6_DEFAULT_CONFIG.mediaPort);
  const toMap = Number(input.toMap ?? previous?.toMap ?? CMSV6_DEFAULT_CONFIG.toMap);
  const baseUrl = String(input.baseUrl ?? previous?.baseUrl ?? CMSV6_DEFAULT_CONFIG.baseUrl).trim().replace(/\/+$/, "");
  let mediaHost = String(input.mediaHost ?? previous?.mediaHost ?? "").trim();
  if (!mediaHost && baseUrl) {
    try {
      mediaHost = new URL(baseUrl).hostname;
    } catch {
      mediaHost = CMSV6_DEFAULT_CONFIG.mediaHost;
    }
  }
  const enabledRaw = input.enabled ?? previous?.enabled ?? false;
  const enabled = enabledRaw === true || String(enabledRaw).toLowerCase() === "true" || String(enabledRaw) === "1";
  const authMode = String(input.authMode ?? previous?.authMode ?? "sso").trim().toLowerCase() === "password" ? "password" : "sso";
  return {
    site: String(input.site ?? previous?.site ?? "").trim(),
    enabled,
    authMode,
    baseUrl: baseUrl || CMSV6_DEFAULT_CONFIG.baseUrl,
    account: String(input.account ?? previous?.account ?? "").trim(),
    password: nextPassword || String(previous?.password ?? ""),
    jsession: nextSession || String(previous?.jsession ?? ""),
    language: String(input.language ?? previous?.language ?? "en").trim() || "en",
    mediaHost: mediaHost || CMSV6_DEFAULT_CONFIG.mediaHost,
    mediaPort: Number.isFinite(mediaPort) && mediaPort > 0 ? Math.floor(mediaPort) : CMSV6_DEFAULT_CONFIG.mediaPort,
    toMap: Number.isFinite(toMap) ? Math.floor(toMap) : 2,
    positioningProtocol: String(input.positioningProtocol ?? previous?.positioningProtocol ?? "JT/T808").trim() || "JT/T808",
    videoProtocol: String(input.videoProtocol ?? previous?.videoProtocol ?? "JT/T1078").trim() || "JT/T1078",
    updatedAt: new Date().toISOString()
  };
}

export function parseCmsv6Config(raw: string | null | undefined): Cmsv6PlatformConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeCmsv6Config(parsed);
  } catch {
    return null;
  }
}
