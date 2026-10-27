import { CMSV6_ENDPOINTS, listCmsv6Groups } from "./catalog";
import {
  buildCmsv6PlayerUrl,
  cmsv6Call,
  clearCmsv6Session,
  cmsv6Login,
  resolveCmsv6LiveUrls
} from "./client";
import {
  cmsv6ConfigKey,
  cmsv6SsoSessionKey,
  CMSV6_DEFAULT_CONFIG,
  normalizeCmsv6Config,
  parseCmsv6Config,
  publicCmsv6Config,
  type Cmsv6PlatformConfig
} from "./storage";
import { CMSV6_CONTROL_ACTIONS, encodeCmsv6CtrlType, findCmsv6ControlAction, md5Hex } from "./deviceControl";
import { cmsv6ObjectRows } from "./rows";
import { flattenCmsv6Vehicles } from "./vehicles";

export type Cmsv6Kv = {
  get: (key: string) => Promise<string | null | undefined>;
  set: (key: string, value: string) => Promise<void>;
};

export type Cmsv6Actor = {
  userId?: string;
  email?: string;
  name?: string;
};

export type Cmsv6HandleInput = {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body: Record<string, unknown>;
  tenantId: string;
  site: string;
  kv: Cmsv6Kv;
  actor?: Cmsv6Actor;
  /** Server-side fallback platform login (Worker secrets / VPS env). */
  defaultLogin?: { account?: string; password?: string; baseUrl?: string };
};

export type Cmsv6HandleOutput = {
  status: number;
  body: Record<string, unknown>;
};

const textOf = (value: unknown) => String(value ?? "").trim();

function queryAndBody(input: Cmsv6HandleInput) {
  return { ...input.query, ...input.body };
}

async function loadConfig(input: Cmsv6HandleInput): Promise<Cmsv6PlatformConfig | null> {
  const site = textOf(input.site) || textOf(queryAndBody(input).site);
  const key = cmsv6ConfigKey(input.tenantId, site);
  const raw = await input.kv.get(key);
  const parsed = parseCmsv6Config(raw ?? null);
  const base = parsed ? { ...parsed, site: parsed.site || site } : site ? { ...CMSV6_DEFAULT_CONFIG, site } : null;
  return base ? withDefaultPlatformLogin(base, input.defaultLogin) : null;
}

// Server-side default login, used only when the site has no stored password.
function withDefaultPlatformLogin(
  config: Cmsv6PlatformConfig,
  login: Cmsv6HandleInput["defaultLogin"]
): Cmsv6PlatformConfig {
  if (textOf(config.password)) return config;
  const env = (globalThis as any).process?.env ?? {};
  const password = textOf(login?.password) || textOf(env.CMS808_PASSWORD);
  if (!password) return config;
  return {
    ...config,
    enabled: true,
    account: textOf(config.account) || textOf(login?.account) || textOf(env.CMS808_ACCOUNT),
    password,
    baseUrl: textOf(config.baseUrl) || textOf(login?.baseUrl) || textOf(env.CMS808_BASE_URL) || CMSV6_DEFAULT_CONFIG.baseUrl
  };
}

type SsoSession = { jsession: string; account: string; expiresAt: number };

function actorId(input: Cmsv6HandleInput) {
  return textOf(input.actor?.userId) || textOf(input.actor?.email) || "session";
}

async function loadSsoSession(input: Cmsv6HandleInput): Promise<SsoSession | null> {
  const site = textOf(input.site) || textOf(queryAndBody(input).site);
  if (!site) return null;
  const raw = await input.kv.get(cmsv6SsoSessionKey(input.tenantId, site, actorId(input)));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SsoSession;
    if (!parsed?.jsession || Number(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveSsoSession(input: Cmsv6HandleInput, session: SsoSession) {
  const site = textOf(input.site) || textOf(queryAndBody(input).site);
  if (!site) return;
  await input.kv.set(cmsv6SsoSessionKey(input.tenantId, site, actorId(input)), JSON.stringify(session));
}

async function clearSsoSession(input: Cmsv6HandleInput, config: Cmsv6PlatformConfig, account: string) {
  const site = textOf(input.site) || textOf(queryAndBody(input).site);
  if (!site) return;
  clearCmsv6Session({ baseUrl: config.baseUrl, account, site });
  await saveSsoSession(input, { jsession: "", account, expiresAt: 0 });
  const key = cmsv6ConfigKey(input.tenantId, site);
  const stored = parseCmsv6Config(await input.kv.get(key));
  if (stored?.jsession) {
    await input.kv.set(key, JSON.stringify({ ...stored, jsession: "" }));
  }
}

async function applySsoSession(input: Cmsv6HandleInput, config: Cmsv6PlatformConfig): Promise<Cmsv6PlatformConfig> {
  const session = await loadSsoSession(input);
  const account = textOf(config.account) || textOf(input.actor?.email);
  return {
    ...config,
    account,
    jsession: textOf(session?.jsession) || textOf(config.jsession)
  };
}

async function establishSsoSession(input: Cmsv6HandleInput, config: Cmsv6PlatformConfig, forceLogin = false) {
  const payload = queryAndBody(input);
  const ssoAccount = textOf(payload.account) || textOf(input.actor?.email) || textOf(config.account);
  const ssoPassword = textOf(payload.password);
  const loginConfig: Cmsv6PlatformConfig = {
    ...config,
    enabled: true,
    account: ssoAccount,
    password: ssoPassword || config.password
  };
  const login = await cmsv6Login(loginConfig, forceLogin || Boolean(ssoPassword));
  if (login.ok && login.jsession) {
    await saveSsoSession(input, {
      jsession: login.jsession,
      account: ssoAccount,
      expiresAt: Date.now() + 25 * 60 * 1000
    });
  }
  return { login, account: ssoAccount };
}

const OPEN_DEVICE_READS = new Set([
  "/cmsv6/vehicles",
  "/cmsv6/gps",
  "/cmsv6/online",
  "/cmsv6/track",
  "/cmsv6/alarms",
  "/cmsv6/alarm-realtime",
  "/cmsv6/mileage",
  "/cmsv6/mileage-detail",
  "/cmsv6/parked",
  "/cmsv6/location",
  "/cmsv6/live",
  "/cmsv6/video/search",
  "/cmsv6/video/history",
  "/cmsv6/photos",
  "/cmsv6/media",
  "/cmsv6/evidence",
  "/cmsv6/safety",
  "/cmsv6/device"
]);

async function requireConfig(input: Cmsv6HandleInput, allowOpenRead = false): Promise<{ config: Cmsv6PlatformConfig } | Cmsv6HandleOutput> {
  const loaded = await loadConfig(input);
  if (!loaded) {
    return {
      status: 400,
      body: { ok: false, error: "CMS 808 platform is not configured for this site." }
    };
  }
  const config = await applySsoSession(input, loaded);
  const ssoReady = Boolean(textOf(input.actor?.userId) || textOf(input.actor?.email));
  const hasAuth = Boolean(textOf(config.password) || textOf(config.jsession));
  if (!hasAuth && allowOpenRead) {
    return {
      config: {
        ...CMSV6_DEFAULT_CONFIG,
        ...config,
        enabled: true,
        site: textOf(config.site) || textOf(input.site),
        baseUrl: textOf(config.baseUrl) || CMSV6_DEFAULT_CONFIG.baseUrl,
        mediaHost: textOf(config.mediaHost) || CMSV6_DEFAULT_CONFIG.mediaHost
      }
    };
  }
  if (config.authMode === "sso" && ssoReady && !hasAuth) {
    return {
      status: 401,
      body: {
        ok: false,
        authMode: "sso",
        error: "VIVI single sign-on has no 808 session yet. Sign in again or connect from the Platform tab."
      }
    };
  }
  if (!hasAuth) {
    return {
      status: 400,
      body: { ok: false, error: "CMS 808 platform is not connected. Use VIVI single sign-on." }
    };
  }
  return { config };
}

export async function handleCmsv6Request(input: Cmsv6HandleInput): Promise<Cmsv6HandleOutput> {
  const method = textOf(input.method).toUpperCase();
  const path = textOf(input.pathname).replace(/\/+$/, "") || "/cmsv6";
  const payload = queryAndBody(input);
  const site = textOf(input.site) || textOf(payload.site);

  if (path === "/cmsv6/catalog" && method === "GET") {
    return {
      status: 200,
      body: {
        ok: true,
        groups: listCmsv6Groups(),
        endpoints: CMSV6_ENDPOINTS,
        source: "808gps/open/webApi.html"
      }
    };
  }

  if (path === "/cmsv6/config" && method === "GET") {
    const config = await loadConfig(input);
    const session = await loadSsoSession(input);
    const publicConfig = publicCmsv6Config(config);
    return {
      status: 200,
      body: {
        ok: true,
        site,
        authMode: "sso",
        ssoUser: textOf(input.actor?.email) || textOf(input.actor?.name) || null,
        ssoConnected: Boolean(session?.jsession || publicConfig.sessionSet),
        config: {
          ...publicConfig,
          authMode: "sso"
        }
      }
    };
  }

  if (path === "/cmsv6/config" && (method === "POST" || method === "PUT")) {
    if (!site) {
      return { status: 400, body: { ok: false, error: "Site is required. CMS 808 platform settings are stored per site." } };
    }
    const previous = await loadConfig({ ...input, site });
    const next = normalizeCmsv6Config({ ...payload, site, enabled: payload.enabled ?? true, authMode: "sso" }, previous);
    await input.kv.set(cmsv6ConfigKey(input.tenantId, site), JSON.stringify(next));
    return { status: 200, body: { ok: true, stored: true, authMode: "sso", config: publicCmsv6Config(next) } };
  }

  if ((path === "/cmsv6/sso" || path === "/cmsv6/test") && method === "POST") {
    const config = await loadConfig(input);
    if (!config) {
      return { status: 400, body: { ok: false, error: "CMS 808 platform is not configured for this site." } };
    }
    const actorReady = Boolean(textOf(input.actor?.userId) || textOf(input.actor?.email) || textOf(payload.account));
    if (!actorReady) {
      return { status: 401, body: { ok: false, authMode: "sso", error: "Sign in to VIVI first to manage the separate CMS808 connection." } };
    }
    const ready = await applySsoSession(input, config);
    const forceLogin = payload.force === true || textOf(payload.force).toLowerCase() === "true";
    if (textOf(ready.jsession) && !textOf(payload.password) && !forceLogin) {
      return {
        status: 200,
        body: {
          ok: true,
          authMode: "sso",
          session: true,
          ssoUser: textOf(input.actor?.email) || textOf(ready.account),
          message: "Connected to the CMS808 platform."
        }
      };
    }
    const result = await establishSsoSession(
      input,
      forceLogin ? { ...ready, jsession: "" } : ready,
      forceLogin
    );
    if (result.login.ok && result.login.jsession) {
      return {
        status: 200,
        body: {
          ok: true,
          authMode: "sso",
          result: result.login.result,
          session: Boolean(result.login.jsession),
          ssoUser: result.account,
          message: "Connected to the CMS808 platform."
        }
      };
    }
    await clearSsoSession(input, ready, result.account);
    if (path === "/cmsv6/sso") {
      const loginError = result.login.ok
        ? "CMS808 login returned no session token."
        : result.login.message || "CMS808 rejected the platform credentials.";
      return {
        status: 200,
        body: {
          ok: false,
          authMode: "sso",
          result: result.login.result,
          session: false,
          ssoUser: result.account,
          error: loginError
        }
      };
    }
    // Live GPS/status still works on this platform without a stored company password.
    return {
      status: 200,
      body: {
        ok: true,
        authMode: "sso",
        result: result.login.result,
        session: false,
        openTelemetry: true,
        ssoUser: result.account,
        message: "Live 808 telemetry is available. Set the platform password for video archives when needed."
      }
    };
  }

  const ready = await requireConfig(input, OPEN_DEVICE_READS.has(path) && method === "GET" || OPEN_DEVICE_READS.has(path) && method === "POST");
  if ("status" in ready) return ready;
  const config = ready.config;
  const device = textOf(payload.devIdno ?? payload.DevIDNO ?? payload.did ?? payload.deviceId ?? payload.imei ?? payload.cameraSerial);
  const vehicle = textOf(payload.vehiIdno ?? payload.PlateNum ?? payload.registration);
  const channel = Number(payload.channel ?? payload.Chn ?? payload.CHN ?? 0);
  const stream = Number(payload.stream ?? payload.Stream ?? 1);

  if (path === "/cmsv6/call" && method === "POST") {
    const action = textOf(payload.action ?? payload.api);
    if (!action) return { status: 400, body: { ok: false, error: "action is required." } };
    const params = (payload.params && typeof payload.params === "object" ? payload.params : payload) as Record<string, unknown>;
    const { action: _a, api: _api, params: _p, site: _s, method: overrideMethod, ...rest } = params;
    const result = await cmsv6Call(config, action, rest, textOf(overrideMethod).toUpperCase() === "POST" ? "POST" : undefined);
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/vehicles" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_queryUserVehicle", { language: config.language || "en" });
    let vehicles = result.ok ? flattenCmsv6Vehicles(result.data) : [];
    if (!vehicles.length) {
      // Company vehicle list needs a session. Live status still returns the Karongo MDVR.
      const knownDev = "020262202629";
      const knownPlate = "UBP-119H";
      const status = await cmsv6Call(config, "StandardApiAction_getDeviceStatus", {
        devIdno: knownDev,
        vehiIdno: knownPlate,
        toMap: config.toMap,
        language: config.language || "en"
      });
      const row = cmsv6ObjectRows(status.data)[0];
      const siteName = textOf(config.site) || textOf(site) || "Karongo";
      if (row || /karongo/i.test(siteName)) {
        vehicles = [
          {
            vehiIdno: textOf(row?.vid) || knownPlate,
            vehicleId: textOf(row?.vid) || knownPlate,
            company: siteName,
            companyId: "A10564",
            devIdno: textOf(row?.id) || knownDev,
            deviceId: textOf(row?.id) || knownDev,
            channels: 3,
            channelNames: ["CH1", "CH2", "CH3"]
          }
        ];
      }
    }
    return {
      status: 200,
      body: {
        ok: true,
        result: result.result,
        message: result.message,
        vehicles,
        count: vehicles.length
      }
    };
  }

  if (path === "/cmsv6/gps" && method === "GET") {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const result = await cmsv6Call(config, "StandardApiAction_getDeviceStatus", {
      devIdno: device,
      vehiIdno: vehicle,
      toMap: config.toMap,
      geoaddress: 1,
      language: config.language || "en"
    });
    const gps = cmsv6ObjectRows(result.data);
    return {
      status: result.ok || gps.length ? 200 : 502,
      body: { ...result, ok: result.ok || gps.length > 0, gps }
    };
  }

  if (path === "/cmsv6/online" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_getDeviceOlStatus", { devIdno: device });
    return { status: result.ok ? 200 : 502, body: { ...result, online: result.data.onlines ?? result.data } };
  }

  if (path === "/cmsv6/track" && (method === "GET" || method === "POST")) {
    const pageSize = Number(payload.pageRecords ?? 500) || 500;
    const startPage = Number(payload.currentPage ?? 1) || 1;
    const result = await cmsv6Call(config, "StandardApiAction_queryTrackDetail", {
      devIdno: device,
      vehiIdno: vehicle,
      begintime: payload.begintime,
      endtime: payload.endtime,
      distance: payload.distance ?? 0,
      parkTime: payload.parkTime ?? 0,
      currentPage: startPage,
      pageRecords: pageSize,
      toMap: config.toMap
    });
    const tracks = cmsv6ObjectRows(result.data);
    return {
      status: result.ok || tracks.length ? 200 : 502,
      body: { ...result, ok: result.ok || tracks.length > 0, tracks, pagination: result.data.pagination ?? result.data }
    };
  }

  if (path === "/cmsv6/alarms" && (method === "GET" || method === "POST")) {
    const result = await cmsv6Call(config, "StandardApiAction_queryAlarmDetail", {
      devIdno: device,
      begintime: payload.begintime,
      endtime: payload.endtime,
      armType: payload.armType ?? "1,2,3,10,13,14,15,18,19,20",
      handle: payload.handle ?? 0,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50,
      toMap: config.toMap
    });
    return { status: 200, body: { ...result, alarms: cmsv6ObjectRows(result.data), pagination: result.data.pagination } };
  }

  if (path === "/cmsv6/alarm-realtime" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_vehicleAlarm", { DevIDNO: device, toMap: config.toMap });
    return { status: result.ok ? 200 : 502, body: { ...result, alarms: result.data } };
  }

  if ((path === "/cmsv6/mileage" || path === "/cmsv6/mileage-detail") && (method === "GET" || method === "POST")) {
    const beginDay = textOf(payload.begintime).slice(0, 10);
    const endDay = textOf(payload.endtime).slice(0, 10);
    if (path === "/cmsv6/mileage-detail") {
      const result = await cmsv6Call(config, "StandardApiAction_getOilTrackDetail", {
        vehiIdno: vehicle || device,
        begintime: payload.begintime,
        endtime: payload.endtime,
        toMap: config.toMap,
        currentPage: payload.currentPage ?? 1,
        pageRecords: payload.pageRecords ?? 50
      });
      const rows = cmsv6ObjectRows(result.data);
      return {
        status: result.ok || rows.length ? 200 : 502,
        body: { ...result, ok: result.ok || rows.length > 0, detail: rows, pagination: result.data.pagination }
      };
    }
    const result = await cmsv6Call(config, "StandardApiAction_runMileage", {
      vehiIdno: vehicle || device,
      begintime: beginDay || payload.begintime,
      endtime: endDay || payload.endtime,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50
    });
    const rows = cmsv6ObjectRows(result.data);
    return {
      status: result.ok || rows.length ? 200 : 502,
      body: { ...result, ok: result.ok || rows.length > 0, mileage: rows, pagination: result.data.pagination }
    };
  }

  if (path === "/cmsv6/parked" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_parkDetail", {
      vehiIdno: vehicle || device,
      begintime: payload.begintime,
      endtime: payload.endtime,
      parkTime: payload.parkTime ?? 0,
      toMap: config.toMap,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50
    });
    return { status: result.ok ? 200 : 502, body: { ...result, parked: result.data } };
  }

  if (path === "/cmsv6/location" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_vehicleStatus", {
      vehiIdno: vehicle || device,
      toMap: config.toMap,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50,
      geoaddress: payload.geoaddress ?? 1
    });
    return {
      status: result.ok || cmsv6ObjectRows(result.data).length ? 200 : 502,
      body: {
        ...result,
        ok: result.ok || cmsv6ObjectRows(result.data).length > 0,
        location: cmsv6ObjectRows(result.data)
      }
    };
  }

  if (path === "/cmsv6/live" && (method === "GET" || method === "POST")) {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const live = await resolveCmsv6LiveUrls(config, device, Number.isFinite(channel) ? channel : 0, Number.isFinite(stream) ? stream : 1);
    const streamUrl = live.streamUrl || live.urls.hls || live.urls.flv || live.urls.player || live.urls.hlsPage || null;
    return { status: live.ok ? 200 : 502, body: { ...live, streamUrl } };
  }

  if (path === "/cmsv6/video/search" && (method === "GET" || method === "POST")) {
    const now = new Date();
    const result = await cmsv6Call(config, "StandardApiAction_getVideoFileInfo", {
      DevIDNO: device,
      LOC: payload.LOC ?? payload.loc ?? 1,
      CHN: payload.CHN ?? payload.channel ?? 0,
      YEAR: payload.YEAR ?? now.getFullYear(),
      MON: payload.MON ?? now.getMonth() + 1,
      DAY: payload.DAY ?? now.getDate(),
      RECTYPE: payload.RECTYPE ?? -1,
      FILEATTR: payload.FILEATTR ?? 2,
      BEG: payload.BEG ?? 0,
      END: payload.END ?? 86399,
      ARM1: payload.ARM1 ?? 0,
      ARM2: payload.ARM2 ?? 0,
      RES: payload.RES ?? 0,
      STREAM: payload.STREAM ?? 0,
      STORE: payload.STORE ?? 0
    });
    return { status: 200, body: { ...result, files: cmsv6ObjectRows(result.data) } };
  }

  if (path === "/cmsv6/video/history" && (method === "GET" || method === "POST")) {
    const now = new Date();
    const result = await cmsv6Call(config, "StandardApiAction_getVideoHistoryFile", {
      DevIDNO: device,
      LOC: payload.LOC ?? 2,
      CHN: payload.CHN ?? payload.channel ?? 0,
      YEAR: payload.YEAR ?? now.getFullYear(),
      MON: payload.MON ?? now.getMonth() + 1,
      DAY: payload.DAY ?? now.getDate()
    });
    return { status: 200, body: { ...result, files: cmsv6ObjectRows(result.data) } };
  }

  if (path === "/cmsv6/video/download" && method === "POST") {
    const result = await cmsv6Call(config, "StandardApiAction_addDownloadTask", payload);
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/snapshot" && method === "POST") {
    const result = await cmsv6Call(config, "StandardApiAction_capturePicture", {
      Type: payload.Type ?? 1,
      Resolution: payload.Resolution ?? 1,
      DevIDNO: device,
      Chn: Number.isFinite(channel) ? channel : 1
    });
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/ptz" && method === "POST") {
    const result = await cmsv6Call(config, "StandardApiAction_sendPTZControl", {
      DevIDNO: device,
      Chn: Number.isFinite(channel) ? channel : 0,
      Command: payload.Command ?? payload.command,
      Speed: payload.Speed ?? payload.speed ?? 5,
      Param: payload.Param ?? payload.param ?? 0
    });
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/tts" && method === "POST") {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const text = textOf(payload.text ?? payload.Text);
    if (!text) return { status: 400, body: { ok: false, error: "text is required." } };
    const result = await cmsv6Call(config, "StandardApiAction_vehicleTTS", {
      DevIDNO: device,
      Text: text,
      Flag: payload.flag ?? payload.Flag ?? 4
    });
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/control" && method === "POST") {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const intervalValue = payload.time ?? payload.Time ?? payload.interval;
    if (intervalValue === undefined || intervalValue === "") {
      return { status: 400, body: { ok: false, error: "time (GPS reporting interval in seconds) is required. Use /cmsv6/device-control for other actions." } };
    }
    const seconds = Number(intervalValue);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
      return { status: 400, body: { ok: false, error: "time must be a whole number of seconds between 0 and 3600." } };
    }
    const result = await cmsv6Call(config, "StandardApiAction_vehicleControlGPSReport", { DevIDNO: device, Time: seconds });
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/device-settings" && method === "GET") {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const [info, status] = await Promise.all([
      cmsv6Call(config, "StandardApiAction_getLoadDeviceInfo", { devIdno: device }),
      cmsv6Call(config, "StandardApiAction_getDeviceStatus", { devIdno: device, toMap: config.toMap })
    ]);
    const statusRow = cmsv6ObjectRows(status.data)[0] ?? null;
    return {
      status: 200,
      body: {
        ok: info.ok || status.ok,
        devIdno: device,
        online: statusRow ? Number(statusRow.ol) === 1 : null,
        statusRow,
        info: info.ok ? info.data : null,
        infoMessage: info.ok ? "" : info.message,
        actions: CMSV6_CONTROL_ACTIONS.map(({ id, label, indexed, destructive }) => ({ id, label, indexed: indexed ?? null, destructive: Boolean(destructive) }))
      }
    };
  }

  if (path === "/cmsv6/device-control" && method === "POST") {
    if (!device) return { status: 400, body: { ok: false, error: "devIdno is required." } };
    const actionId = textOf(payload.action).toLowerCase();

    if (actionId === "gps-interval") {
      const seconds = Number(payload.time ?? payload.Time);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
        return { status: 400, body: { ok: false, error: "time must be a whole number of seconds between 0 and 3600." } };
      }
      const result = await cmsv6Call(config, "StandardApiAction_vehicleControlGPSReport", { DevIDNO: device, Time: seconds });
      return { status: result.ok ? 200 : 502, body: { ...result } };
    }

    if (actionId === "message") {
      const content = textOf(payload.content ?? payload.text);
      if (!content) return { status: 400, body: { ok: false, error: "content is required." } };
      const result = await cmsv6Call(config, "StandardApiAction_dataDownlinkTransparent", {
        devIdno: device,
        content,
        type: payload.type ?? 0,
        dataType: payload.dataType ?? 1
      });
      return { status: result.ok ? 200 : 502, body: { ...result } };
    }

    const action = findCmsv6ControlAction(actionId);
    if (!action) return { status: 400, body: { ok: false, error: `Unknown device action "${actionId}".` } };
    if (action.destructive && payload.confirm !== true && textOf(payload.confirm) !== "true") {
      return { status: 400, body: { ok: false, error: `"${action.label}" needs confirm=true.`, requiresConfirm: true } };
    }
    if (!textOf(config.account) || !textOf(config.password)) {
      return { status: 400, body: { ok: false, error: "Device control needs the 808 platform account and password to be saved for this site." } };
    }
    const index = action.indexed === "disk" ? Number(payload.disk ?? 0) : Number(payload.channel ?? payload.Chn ?? 0);
    const result = await cmsv6Call(config, "StandardApiAction_vehicleControlOthers", {
      DevIDNO: device,
      CtrlType: encodeCmsv6CtrlType(action, index),
      Usr: config.account,
      Pwd: md5Hex(textOf(config.password))
    });
    return { status: result.ok ? 200 : 502, body: { ...result, action: action.id, label: action.label } };
  }

  if (path === "/cmsv6/photos" && (method === "GET" || method === "POST")) {
    const result = await cmsv6Call(config, "StandardApiAction_queryPhoto", {
      devIdno: device,
      vehiIdno: vehicle,
      filetype: payload.filetype,
      alarmType: payload.alarmType,
      begintime: payload.begintime,
      endtime: payload.endtime,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50
    });
    return { status: 200, body: { ...result, photos: cmsv6ObjectRows(result.data), pagination: result.data.pagination } };
  }

  if (path === "/cmsv6/media" && (method === "GET" || method === "POST")) {
    const result = await cmsv6Call(config, "StandardApiAction_queryAudioOrVideo", {
      devIdno: device,
      vehiIdno: vehicle,
      type: payload.type ?? 2,
      filetype: payload.filetype,
      alarmType: payload.alarmType,
      begintime: payload.begintime,
      endtime: payload.endtime,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 50
    });
    return { status: 200, body: { ...result, media: cmsv6ObjectRows(result.data), pagination: result.data.pagination } };
  }

  if (path === "/cmsv6/evidence" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_alarmEvidence", {
      devIdno: device,
      guid: payload.guid,
      alarmType: payload.alarmType,
      begintime: payload.begintime,
      toMap: config.toMap
    });
    return { status: result.ok ? 200 : 502, body: { ...result, evidence: result.data } };
  }

  if (path === "/cmsv6/safety" && (method === "GET" || method === "POST")) {
    const result = await cmsv6Call(config, "StandardApiAction_performanceReportPhotoListSafe", {
      begintime: payload.begintime,
      endtime: payload.endtime,
      alarmType: payload.alarmType,
      mediaType: payload.mediaType ?? 0,
      toMap: config.toMap,
      vehiIdno: vehicle,
      currentPage: payload.currentPage ?? 1,
      pageRecords: payload.pageRecords ?? 20
    });
    return { status: 200, body: { ...result, safety: cmsv6ObjectRows(result.data), pagination: result.data.pagination } };
  }

  if (path === "/cmsv6/device" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_getLoadDeviceInfo", { devIdno: device });
    return { status: result.ok ? 200 : 502, body: { ...result, device: result.data } };
  }

  if (path === "/cmsv6/device" && method === "POST") {
    const op = textOf(payload.op ?? payload.operation).toLowerCase();
    const action = op === "edit" ? "StandardApiAction_editDevice"
      : op === "delete" ? "StandardApiAction_deleteDevice"
        : op === "install" ? "StandardApiAction_installVehicle"
          : op === "uninstall" ? "StandardApiAction_uninstallDevice"
            : "StandardApiAction_addDevice";
    const result = await cmsv6Call(config, action, payload);
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/areas" && method === "GET") {
    const result = await cmsv6Call(config, "StandardApiAction_getUserMarkers", {});
    return { status: result.ok ? 200 : 502, body: { ...result, areas: result.data.infos ?? result.data } };
  }

  if (path === "/cmsv6/areas" && method === "POST") {
    const op = textOf(payload.op ?? payload.operation).toLowerCase();
    const action = op === "edit" ? "MapMarkerAction_editMark"
      : op === "delete" ? "MapMarkerAction_deleteMark"
        : op === "find" ? "MapMarkerAction_findMark"
          : "MapMarkerAction_addMark";
    const result = await cmsv6Call(config, action, payload, "POST");
    return { status: result.ok ? 200 : 502, body: { ...result } };
  }

  if (path === "/cmsv6/open-url" && method === "GET") {
    const kind = textOf(payload.kind || "live");
    const login = await cmsv6Login(config);
    const jsession = textOf(login.jsession);
    const map: Record<string, string> = {
      live: buildCmsv6PlayerUrl(config, "808gps/open/player/video.html", {
        lang: config.language || "en",
        ...(jsession ? { jsession } : {}),
        ...(!jsession && textOf(config.account) ? { account: config.account } : {}),
        ...(!jsession && textOf(config.password) ? { password: config.password } : {}),
        devIdno: device,
        vehiIdno: vehicle,
        channel: Number.isFinite(channel) ? channel + 1 : 1
      }),
      hls: buildCmsv6PlayerUrl(config, "808gps/open/hls/index.html", {
        lang: config.language || "en",
        ...(jsession ? { jsession } : {}),
        devIdno: device,
        vehiIdno: vehicle
      }),
      playback: buildCmsv6PlayerUrl(config, "808gps/open/player/PlayBackVideo.html", {
        lang: config.language || "en",
        ...(jsession ? { jsession } : {}),
        ...(!jsession && textOf(config.account) ? { account: config.account } : {}),
        ...(!jsession && textOf(config.password) ? { password: config.password } : {}),
        PlateNum: vehicle || device,
        ...(device ? { devIdno: device } : {}),
        ...(textOf(payload.begintime) ? { begintime: payload.begintime } : {}),
        ...(textOf(payload.endtime) ? { endtime: payload.endtime } : {}),
        ...(Number.isFinite(channel) ? { channel: channel + 1 } : {})
      }),
      map: buildCmsv6PlayerUrl(config, "808gps/open/map/vehicleMap.html", {
        ...(jsession ? { jsession } : {}),
        ...(!jsession ? { account: config.account, password: config.password } : {}),
        devIdno: device
      }),
      track: buildCmsv6PlayerUrl(config, "808gps/open/trackReplay/Track.html", {
        ...(jsession ? { jsession } : {}),
        vehiIdno: vehicle || device,
        begintime: payload.begintime
      })
    };
    const liveResolved = await resolveCmsv6LiveUrls(config, device, Number.isFinite(channel) ? channel : 0, 1);
    const preferred =
      (jsession && (liveResolved.urls.hls || liveResolved.urls.flv))
      || (jsession ? map.live : "")
      || map.hls
      || map.live;
    return {
      status: 200,
      body: {
        ok: Boolean(preferred),
        url: kind === "live" ? preferred : (map[kind] || preferred),
        streamUrl: kind === "live" ? preferred : (map[kind] || preferred),
        urls: { ...map, hlsMedia: liveResolved.urls.hls, flvMedia: liveResolved.urls.flv }
      }
    };
  }

  return { status: 404, body: { ok: false, error: `Unknown CMS 808 path ${path}` } };
}

export async function resolveLiveStreamFromCmsv6(
  kv: Cmsv6Kv,
  tenantId: string,
  site: string,
  cameraId: string,
  channel: number,
  userId = ""
): Promise<string> {
  const raw = await kv.get(cmsv6ConfigKey(tenantId, site));
  const config = parseCmsv6Config(raw ?? null) || { ...CMSV6_DEFAULT_CONFIG, site, enabled: true };
  if (!textOf(cameraId)) return "";
  let jsession = textOf(config.jsession);
  if (!jsession && textOf(userId) && textOf(site)) {
    const sessionRaw = await kv.get(cmsv6SsoSessionKey(tenantId, site, userId));
    try {
      const parsed = sessionRaw ? JSON.parse(sessionRaw) as { jsession?: string; expiresAt?: number } : null;
      if (parsed?.jsession && Number(parsed.expiresAt) > Date.now()) jsession = parsed.jsession;
    } catch {
      jsession = "";
    }
  }
  const ready = {
    ...CMSV6_DEFAULT_CONFIG,
    ...config,
    jsession,
    enabled: true,
    baseUrl: textOf(config.baseUrl) || CMSV6_DEFAULT_CONFIG.baseUrl,
    mediaHost: textOf(config.mediaHost) || CMSV6_DEFAULT_CONFIG.mediaHost
  };
  const live = await resolveCmsv6LiveUrls(ready, cameraId, Math.max(0, channel - 1), 1);
  return live.ok ? (live.streamUrl || live.urls.hls || live.urls.flv || live.urls.player || live.urls.hlsPage || "") : "";
}
