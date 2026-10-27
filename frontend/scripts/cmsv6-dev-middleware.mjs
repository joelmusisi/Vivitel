const text = (value) => String(value ?? "").trim();

const API_TARGET = text(process.env.VIVI_API_TARGET) || "https://us.vivitelematics.ca";
const CMS_BASE = "https://gps.hboiot.com:8088";

const KNOWN_VEHICLE = {
  vehiIdno: "UBP-119H",
  vehicleId: "UBP-119H",
  company: "Karongo",
  companyId: "A10564",
  devIdno: "020262202629",
  deviceId: "020262202629",
  channels: 3,
  channelNames: ["CH1", "CH2", "CH3"]
};

const KNOWN_GPS = {
  vid: "UBP-119H",
  did: "020262202629",
  mlat: 0.638689,
  mlng: 34.25605,
  ol: 1,
  gt: "2026-09-19 01:22:00",
  sp: 0
};

/** In-memory 808 platform session for local live player URLs. */
let platformSession = { jsession: "", account: "", expiresAt: 0 };

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });

const pathnameOf = (req) => String(req.url ?? "").split("?")[0].replace(/\/+$/, "") || "/";

const pickHeader = (req, name) => {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? text(value[0]) : text(value);
};

const hasJsession = (url) => /[?&]jsession=/i.test(text(url));

async function proxyUpstream(req, pathname, method, body) {
  const query = String(req.url ?? "").includes("?") ? `?${String(req.url).split("?").slice(1).join("?")}` : "";
  const headers = {
    Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
    "content-type": "application/json; charset=utf-8"
  };
  for (const key of [
    "authorization",
    "cookie",
    "x-api-key",
    "x-tenant-id",
    "x-site-name",
    "x-vivi-user-id",
    "x-vivi-user-email",
    "x-vivi-session"
  ]) {
    const value = pickHeader(req, key);
    if (value) headers[key] = value;
  }
  try {
    const response = await fetch(`${API_TARGET}${pathname}${query}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {})
    });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!response.ok || !parsed || typeof parsed !== "object") return null;
    return { status: response.status, body: parsed };
  } catch {
    return null;
  }
}

async function loginPlatform(account, password) {
  const user = text(account) || text(process.env.CMSV6_ACCOUNT) || text(process.env.VITE_CMSV6_ACCOUNT);
  const pass = text(password) || text(process.env.CMSV6_PASSWORD) || text(process.env.VITE_CMSV6_PASSWORD);
  if (!user || !pass) {
    return { ok: false, message: "808 account and password are required for live video.", jsession: "" };
  }
  try {
    const url = new URL(`${CMS_BASE}/StandardApiAction_login.action`);
    url.searchParams.set("account", user);
    url.searchParams.set("password", pass);
    const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json,text/plain;q=0.9,*/*;q=0.8" } });
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const jsession = text(parsed?.jsession ?? parsed?.JSESSIONID);
    const result = Number(parsed?.result ?? 5);
    if (result === 0 && jsession) {
      platformSession = { jsession, account: user, expiresAt: Date.now() + 25 * 60 * 1000 };
      return { ok: true, message: "Connected to 808 platform.", jsession };
    }
    return { ok: false, message: text(parsed?.message) || `808 login failed (${result}).`, jsession: "" };
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error), jsession: "" };
  }
}

async function ensurePlatformSession(account = "", password = "") {
  if (platformSession.jsession && platformSession.expiresAt > Date.now()) {
    return { ok: true, jsession: platformSession.jsession, message: "Using cached 808 session." };
  }
  return loginPlatform(account, password);
}

function buildLiveUrls(devIdno, channel = 0, jsession = "") {
  const device = text(devIdno) || KNOWN_VEHICLE.devIdno;
  const ch = Math.max(0, Math.floor(Number(channel) || 0));
  const session = text(jsession);
  const player = new URL(`${CMS_BASE}/808gps/open/player/video.html`);
  player.searchParams.set("lang", "en");
  if (session) player.searchParams.set("jsession", session);
  player.searchParams.set("devIdno", device);
  player.searchParams.set("channel", String(ch + 1));
  player.searchParams.set("stream", "1");
  const hlsPage = new URL(`${CMS_BASE}/808gps/open/hls/index.html`);
  hlsPage.searchParams.set("lang", "en");
  if (session) hlsPage.searchParams.set("jsession", session);
  hlsPage.searchParams.set("devIdno", device);
  hlsPage.searchParams.set("channel", String(ch));
  const hls = session
    ? `http://gps.hboiot.com:6603/hls/1_${encodeURIComponent(device)}_${ch}_1.m3u8?jsession=${encodeURIComponent(session)}`
    : "";
  const flv = session
    ? `http://gps.hboiot.com:6603/3/3?AVType=1&jsession=${encodeURIComponent(session)}&DevIDNO=${encodeURIComponent(device)}&Channel=${ch}&Stream=1`
    : "";
  return {
    player: player.toString(),
    hlsPage: hlsPage.toString(),
    hls,
    flv
  };
}

export function cmsv6DevMiddleware() {
  return {
    name: "cmsv6-dev-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = pathnameOf(req);
        if (!pathname.startsWith("/cmsv6")) {
          next();
          return;
        }

        const method = String(req.method ?? "GET").toUpperCase();
        const query = Object.fromEntries(new URL(req.url ?? "/", "http://127.0.0.1").searchParams.entries());
        const body = method === "GET" || method === "HEAD" ? {} : await readBody(req);
        const device = text(query.devIdno ?? body.devIdno ?? query.did ?? body.did);
        const plate = text(query.vehiIdno ?? body.vehiIdno ?? query.vid ?? body.vid);

        if (pathname === "/cmsv6/catalog" && method === "GET") {
          sendJson(res, 200, { ok: true, groups: ["Query Vehicle"], endpoints: [] });
          return;
        }

        if (pathname === "/cmsv6/config" && method === "GET") {
          const connected = Boolean(platformSession.jsession && platformSession.expiresAt > Date.now());
          sendJson(res, 200, {
            ok: true,
            site: text(query.site ?? req.headers["x-site-name"]),
            authMode: "sso",
            ssoConnected: connected,
            config: {
              enabled: true,
              baseUrl: CMS_BASE,
              account: "",
              passwordSet: false,
              sessionSet: connected,
              language: "en",
              mediaHost: "gps.hboiot.com",
              mediaPort: 6603,
              positioningProtocol: "JT/T808",
              videoProtocol: "JT/T1078"
            }
          });
          return;
        }

        if (pathname === "/cmsv6/config" && method === "POST") {
          sendJson(res, 200, { ok: true, stored: true, session: true, authMode: "sso", message: "Local 808 config acknowledged." });
          return;
        }

        if ((pathname === "/cmsv6/sso" || pathname === "/cmsv6/test") && method === "POST") {
          const upstream = await proxyUpstream(req, pathname, method, body);
          if (upstream?.body?.ok && (upstream.body.session || upstream.body.jsession)) {
            const jsession = text(upstream.body.jsession);
            if (jsession) {
              platformSession = {
                jsession,
                account: text(upstream.body.ssoUser || body.account),
                expiresAt: Date.now() + 25 * 60 * 1000
              };
            }
            sendJson(res, upstream.status, upstream.body);
            return;
          }
          const login = await ensurePlatformSession(body.account, body.password);
          sendJson(res, login.ok ? 200 : 502, {
            ok: login.ok,
            stored: true,
            session: Boolean(login.jsession),
            authMode: "sso",
            ssoUser: text(body.account) || platformSession.account || null,
            message: login.message
          });
          return;
        }

        if (pathname === "/cmsv6/vehicles" && method === "GET") {
          sendJson(res, 200, { ok: true, vehicles: [KNOWN_VEHICLE], count: 1 });
          return;
        }

        if (pathname === "/cmsv6/track" && (method === "GET" || method === "POST")) {
          if (device && device !== KNOWN_VEHICLE.devIdno) {
            sendJson(res, 200, { ok: true, tracks: [] });
            return;
          }
          const end = Date.now();
          const tracks = Array.from({ length: 24 }, (_, index) => {
            const step = index / 23;
            const at = new Date(end - (23 - index) * 8 * 60 * 1000);
            const pad = (n) => String(n).padStart(2, "0");
            return {
              vid: KNOWN_VEHICLE.vehiIdno,
              did: KNOWN_VEHICLE.devIdno,
              mlat: 0.638689 + step * 0.012,
              mlng: 34.25605 + step * 0.018,
              ol: 1,
              sp: 18,
              gt: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
            };
          });
          sendJson(res, 200, { ok: true, tracks });
          return;
        }

        if ((pathname === "/cmsv6/gps" || pathname === "/cmsv6/location") && (method === "GET" || method === "POST")) {
          if (device && device !== KNOWN_VEHICLE.devIdno) {
            sendJson(res, 200, { ok: true, gps: null, location: null });
            return;
          }
          if (plate && plate !== KNOWN_VEHICLE.vehiIdno) {
            sendJson(res, 200, { ok: true, gps: null, location: null });
            return;
          }
          sendJson(res, 200, { ok: true, gps: KNOWN_GPS, location: KNOWN_GPS });
          return;
        }

        if ((pathname === "/cmsv6/video/search" || pathname === "/cmsv6/video/history") && (method === "GET" || method === "POST")) {
          sendJson(res, 200, { ok: true, files: [] });
          return;
        }

        if ((pathname === "/cmsv6/live" || pathname === "/cmsv6/open-url") && (method === "GET" || method === "POST")) {
          const channel = Number(query.channel ?? body.channel ?? 0) || 0;
          const upstream = await proxyUpstream(req, pathname, method, body);
          const upstreamUrl =
            text(upstream?.body?.streamUrl) ||
            text(upstream?.body?.url) ||
            text(upstream?.body?.urls?.player) ||
            text(upstream?.body?.urls?.hlsPage);
          if (upstream?.body?.ok && upstreamUrl && hasJsession(upstreamUrl)) {
            sendJson(res, upstream.status, {
              ...upstream.body,
              streamUrl: upstreamUrl,
              urls: {
                ...(upstream.body.urls || {}),
                player: text(upstream.body.urls?.player) || upstreamUrl
              }
            });
            return;
          }

          const login = await ensurePlatformSession(body.account, body.password);
          if (!login.ok || !login.jsession) {
            sendJson(res, 401, {
              ok: false,
              authMode: "sso",
              error: login.message || "808 live video needs an authenticated platform session.",
              message: login.message || "Connect 808 SSO (Platform tab) or set CMSV6_ACCOUNT / CMSV6_PASSWORD for local live video."
            });
            return;
          }

          const urls = buildLiveUrls(device || KNOWN_VEHICLE.devIdno, channel, login.jsession);
          sendJson(res, 200, {
            ok: true,
            streamUrl: urls.player,
            url: urls.player,
            urls,
            message: "808 live player opened with authenticated session."
          });
          return;
        }

        if (pathname === "/cmsv6/alarms" && (method === "GET" || method === "POST")) {
          const now = Date.now();
          const stamp = (offsetMs) => {
            const at = new Date(now - offsetMs);
            const pad = (n) => String(n).padStart(2, "0");
            return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
          };
          sendJson(res, 200, {
            ok: true,
            alarms: [
              { guid: "a1", vehiIdno: KNOWN_VEHICLE.vehiIdno, devIdno: KNOWN_VEHICLE.devIdno, armType: "Video loss", desc: "CH1 video loss", bTime: stamp(35 * 60 * 1000) },
              { guid: "a2", vehiIdno: KNOWN_VEHICLE.vehiIdno, devIdno: KNOWN_VEHICLE.devIdno, armType: "Fatigue", desc: "Driver fatigue", bTime: stamp(2 * 60 * 60 * 1000) },
              { guid: "a3", vehiIdno: KNOWN_VEHICLE.vehiIdno, devIdno: KNOWN_VEHICLE.devIdno, armType: "Forward collision", desc: "Forward collision warning", bTime: stamp(5 * 60 * 60 * 1000) },
              { guid: "a4", vehiIdno: KNOWN_VEHICLE.vehiIdno, devIdno: KNOWN_VEHICLE.devIdno, armType: "Lane departure", desc: "Lane departure warning", bTime: stamp(26 * 60 * 60 * 1000) },
              { guid: "a5", vehiIdno: KNOWN_VEHICLE.vehiIdno, devIdno: KNOWN_VEHICLE.devIdno, armType: "Overspeed", desc: "Speed warning", bTime: stamp(30 * 60 * 60 * 1000) }
            ]
          });
          return;
        }

        if (pathname === "/cmsv6/photos" && (method === "GET" || method === "POST")) {
          // No mock evidence — live gallery waits for real platform photos.
          sendJson(res, 200, { ok: true, photos: [] });
          return;
        }

        sendJson(res, 200, { ok: true, message: "Local 808 position API." });
      });
    }
  };
}
