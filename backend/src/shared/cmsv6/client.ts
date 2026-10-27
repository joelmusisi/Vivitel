import { CMSV6_ERROR_CODES, findCmsv6Endpoint } from "./catalog";
import type { Cmsv6PlatformConfig } from "./storage";

type SessionEntry = { jsession: string; expiresAt: number };
const sessionCache = new Map<string, SessionEntry>();
const SESSION_TTL_MS = 25 * 60 * 1000;

export type Cmsv6CallResult = {
  ok: boolean;
  result: number;
  message: string;
  action: string;
  data: Record<string, unknown>;
};

const textOf = (value: unknown) => String(value ?? "").trim();

export function cmsv6SessionCacheKey(config: Pick<Cmsv6PlatformConfig, "baseUrl" | "account" | "site">) {
  return `${config.baseUrl}::${config.account}::${config.site || "default"}`.toLowerCase();
}

export function clearCmsv6Session(config: Pick<Cmsv6PlatformConfig, "baseUrl" | "account" | "site">) {
  sessionCache.delete(cmsv6SessionCacheKey(config));
}

function normalizeAction(action: string) {
  const raw = textOf(action).replace(/^\//, "");
  if (!raw) return "";
  if (raw.endsWith(".action")) return raw;
  if (raw.includes("/")) return raw;
  return `${raw}.action`;
}

function encodeParam(value: unknown) {
  return encodeURIComponent(textOf(value));
}

export function cmsv6Message(result: number, fallback = "") {
  return CMSV6_ERROR_CODES[result] || fallback || `Platform result ${result}`;
}

export async function cmsv6RawRequest(
  config: Cmsv6PlatformConfig,
  action: string,
  params: Record<string, unknown> = {},
  method: "GET" | "POST" = "GET"
): Promise<Cmsv6CallResult> {
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) {
    return { ok: false, result: 5, message: "Fetch is not available.", action, data: {} };
  }
  const base = textOf(config.baseUrl).replace(/\/+$/, "");
  if (!base) {
    return { ok: false, result: 6, message: "Platform base URL is required.", action, data: {} };
  }

  const normalized = normalizeAction(action);
  const url = new URL(`${base}/${normalized}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (method === "GET") url.searchParams.set(key, textOf(value));
    else body.set(key, textOf(value));
  }

  try {
    const resp = await fetchFn(url.toString(), {
      method,
      headers: method === "POST"
        ? { "content-type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json,text/plain;q=0.9,*/*;q=0.8" }
        : { Accept: "application/json,text/plain;q=0.9,*/*;q=0.8" },
      body: method === "POST" ? body.toString() : undefined
    });
    const rawText = await resp.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
    const data = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : { raw: rawText };
    const result = Number(data.result ?? (resp.ok ? 0 : 5));
    return {
      ok: resp.ok && result === 0,
      result: Number.isFinite(result) ? result : 5,
      message: cmsv6Message(Number.isFinite(result) ? result : 5, textOf(data.message ?? data.cmsserver ?? "")),
      action: normalized,
      data
    };
  } catch (error: any) {
    return {
      ok: false,
      result: 5,
      message: textOf(error?.message) || "Platform request failed.",
      action: normalized,
      data: {}
    };
  }
}

export async function cmsv6Login(config: Cmsv6PlatformConfig, force = false): Promise<Cmsv6CallResult & { jsession: string }> {
  const cacheKey = cmsv6SessionCacheKey(config);
  const cached = sessionCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now() && cached.jsession) {
    return { ok: true, result: 0, message: "Session cached.", action: "StandardApiAction_login.action", data: { jsession: cached.jsession }, jsession: cached.jsession };
  }
  const storedSession = textOf(config.jsession);
  if (storedSession && (!force || !textOf(config.password))) {
    sessionCache.set(cacheKey, { jsession: storedSession, expiresAt: Date.now() + SESSION_TTL_MS });
    return { ok: true, result: 0, message: "Using stored platform session.", action: "StandardApiAction_login.action", data: { jsession: storedSession }, jsession: storedSession };
  }
  if (!textOf(config.account) || !textOf(config.password)) {
    return { ok: false, result: 6, message: "Platform account and password are required.", action: "StandardApiAction_login.action", data: {}, jsession: "" };
  }
  const result = await cmsv6RawRequest(config, "StandardApiAction_login", {
    account: config.account,
    password: config.password
  });
  const jsession = textOf(result.data.jsession ?? result.data.JSESSIONID);
  if (result.ok && jsession) {
    sessionCache.set(cacheKey, { jsession, expiresAt: Date.now() + SESSION_TTL_MS });
  }
  return { ...result, jsession };
}

export async function cmsv6Call(
  config: Cmsv6PlatformConfig,
  action: string,
  params: Record<string, unknown> = {},
  method?: "GET" | "POST"
): Promise<Cmsv6CallResult> {
  const endpoint = findCmsv6Endpoint(action);
  const resolvedMethod = method || endpoint?.method || "GET";
  const needsSession = endpoint ? endpoint.requiresSession : true;
  const payload = { ...params };
  if ((needsSession || textOf(payload.jsession)) && !textOf(payload.jsession)) {
    const login = await cmsv6Login(config);
    if (login.ok && login.jsession) payload.jsession = login.jsession;
  }
  let result = await cmsv6RawRequest(config, action, payload, resolvedMethod);
  // This platform still returns live GPS when no session is stored. A rejected
  // session must not hide that response.
  if (result.result === 1 && textOf(payload.jsession)) {
    clearCmsv6Session(config);
    delete payload.jsession;
    const login = await cmsv6Login(config, true);
    if (login.ok && login.jsession) payload.jsession = login.jsession;
    result = await cmsv6RawRequest(config, action, payload, resolvedMethod);
  }
  return result;
}

export function buildCmsv6HlsUrl(config: Cmsv6PlatformConfig, jsession: string, devIdno: string, channel = 0, stream = 1) {
  const host = textOf(config.mediaHost) || new URL(config.baseUrl).hostname;
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const st = stream === 0 ? 0 : 1;
  const streamPort = Number(config.mediaPort) === 6603 ? 6604 : config.mediaPort;
  return `http://${host}:${streamPort}/hls/1_${encodeParam(devIdno)}_${ch}_${st}.m3u8?jsession=${encodeParam(jsession)}`;
}

export function buildCmsv6FlvUrl(config: Cmsv6PlatformConfig, jsession: string, devIdno: string, channel = 0, stream = 1) {
  const host = textOf(config.mediaHost) || new URL(config.baseUrl).hostname;
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const st = stream === 0 ? 0 : 1;
  return `http://${host}:${config.mediaPort}/3/3?AVType=1&jsession=${encodeParam(jsession)}&DevIDNO=${encodeParam(devIdno)}&Channel=${ch}&Stream=${st}`;
}

export function buildCmsv6RtspUrl(config: Cmsv6PlatformConfig, jsession: string, devIdno: string, channel = 0, stream = 1) {
  const host = textOf(config.mediaHost) || new URL(config.baseUrl).hostname;
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const st = stream === 0 ? 0 : 1;
  return `rtsp://${host}:${config.mediaPort}/3/3?AVType=1&jsession=${encodeParam(jsession)}&DevIDNO=${encodeParam(devIdno)}&Channel=${ch}&Stream=${st}`;
}

export function buildCmsv6RtmpUrl(config: Cmsv6PlatformConfig, jsession: string, devIdno: string, channel = 0, stream = 1) {
  const host = textOf(config.mediaHost) || new URL(config.baseUrl).hostname;
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const st = stream === 0 ? 0 : 1;
  return `rtmp://${host}:${config.mediaPort}/3/3?AVType=1&jsession=${encodeParam(jsession)}&DevIDNO=${encodeParam(devIdno)}&Channel=${ch}&Stream=${st}`;
}

export function buildCmsv6PlayerUrl(
  config: Cmsv6PlatformConfig,
  path: string,
  params: Record<string, unknown>
) {
  const url = new URL(`${config.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, textOf(value));
  }
  return url.toString();
}

export async function resolveCmsv6LiveUrls(
  config: Cmsv6PlatformConfig,
  devIdno: string,
  channel = 0,
  stream = 1
) {
  const login = await cmsv6Login(config);
  const jsession = textOf(login.jsession);
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const device = textOf(devIdno);
  // Live GPS already works without a company session on this host. Always build
  // the open player URL so View live is not blocked by missing SSO.
  const urls = {
    hls: jsession ? buildCmsv6HlsUrl(config, jsession, device, ch, stream) : "",
    flv: jsession ? buildCmsv6FlvUrl(config, jsession, device, ch, stream) : "",
    rtsp: jsession ? buildCmsv6RtspUrl(config, jsession, device, ch, stream) : "",
    rtmp: jsession ? buildCmsv6RtmpUrl(config, jsession, device, ch, stream) : "",
    player: buildCmsv6PlayerUrl(config, "808gps/open/player/video.html", {
      lang: config.language || "en",
      ...(jsession ? { jsession } : {}),
      // Prefer session auth. Embedding account/password often triggers vendor "Login Failed" dialogs.
      ...(!jsession && textOf(config.account) ? { account: config.account } : {}),
      ...(!jsession && textOf(config.password) ? { password: config.password } : {}),
      devIdno: device,
      channel: ch + 1,
      stream
    }),
    hlsPage: buildCmsv6PlayerUrl(config, "808gps/open/hls/index.html", {
      lang: config.language || "en",
      ...(jsession ? { jsession } : {}),
      devIdno: device,
      channel: ch
    })
  };
  // Prefer direct media URLs (no vendor HTML/alerts). Fall back to sessioned player page.
  const streamUrl = (jsession && (urls.hls || urls.flv)) || (jsession ? urls.player : "") || urls.hlsPage || urls.player || "";
  return {
    ok: Boolean(streamUrl),
    message: jsession ? "Live stream ready." : "Unable to open a signed live session.",
    jsession,
    urls,
    streamUrl
  };
}
