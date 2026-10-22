const API_PROXY_HOST = "https://api.vivitelematics.ca";

const API_PATH_PREFIXES = [
  "/api/",
  "/auth/",
  "/d1/",
  "/kv/",
  "/telemetry/",
  "/support/",
  "/stream/",
  "/device/",
  "/share/",
  "/camera/",
  "/health",
  "/pat/",
  "/admin/",
  "/echo",
  "/ingest/",
  "/realtime/",
  "/deliver/",
  "/downloads/",
  "/ws"
];

const isApiPath = (pathname) => {
  const path = String(pathname || "");
  if (path === "/ws" || path.startsWith("/ws/")) return true;
  if (path === "/health" || path.startsWith("/health/")) return true;
  if (path === "/echo") return true;
  return API_PATH_PREFIXES.some((prefix) => prefix !== "/ws" && prefix !== "/health" && path.startsWith(prefix));
};

const shouldServeSpaShell = (url) => {
  const pathname = url.pathname;
  if (isApiPath(pathname)) return false;
  if (
    pathname.startsWith("/static/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/marketing/")
  ) {
    return false;
  }
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return false;
  return true;
};

const isStaticAssetPath = (pathname) =>
  pathname.startsWith("/static/") ||
  pathname.startsWith("/assets/") ||
  pathname.startsWith("/marketing/");

const isHtmlResponse = (response) =>
  String(response.headers.get("content-type") || "").includes("text/html");

const withEdgeCdnHeaders = (response, pathname) => {
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  if (pathname.startsWith("/static/") || pathname.startsWith("/assets/")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("cdn-cache-control", "max-age=31536000");
  } else if (pathname.startsWith("/marketing/")) {
    headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
    headers.set("cdn-cache-control", "max-age=86400");
  }
  return new Response(response.body, { status: response.status, headers });
};

const proxyToApiWorker = (request, url) => {
  const target = new URL(request.url);
  target.protocol = "https:";
  target.host = new URL(API_PROXY_HOST).host;
  // Preserve path/query (including /ws?token=…&tenant=…) for API + WebSocket upgrades.
  return fetch(new Request(target.toString(), request));
};

export default {
  async fetch(request, env, ctx) {
    // NOTE: Phones are fully supported. The website is responsive and the app
    // switches to phone mode after login, so no device is blocked at the edge.
    const url = new URL(request.url);

    // API + WebSocket must never be SPA-fallbacked to index.html.
    // Prefer zone Worker routes via _routes.json exclude; this proxy is a safety net.
    if (isApiPath(url.pathname)) {
      try {
        return await proxyToApiWorker(request, url);
      } catch {
        return new Response(JSON.stringify({ error: "API proxy unavailable" }), {
          status: 502,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
    }

    const response = await env.ASSETS.fetch(request);

    // Cloudflare may return index.html (200) for missing /assets/* files — never pass that through.
    if (isStaticAssetPath(url.pathname) && isHtmlResponse(response)) {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    const serveSpaShell =
      request.method === "GET" &&
      response.status === 404 &&
      shouldServeSpaShell(url);

    const spaShellResponse = serveSpaShell
      ? await env.ASSETS.fetch(new Request(new URL("/index.html", url), request))
      : null;

    const finalResponse = spaShellResponse?.ok ? spaShellResponse : response;

    if (
      request.method === "GET" &&
      shouldServeSpaShell(url) &&
      isHtmlResponse(finalResponse)
    ) {
      const headers = new Headers(finalResponse.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.set("cache-control", "no-cache, no-store, must-revalidate");
      headers.set("cdn-cache-control", "no-store");
      return new Response(finalResponse.body, { status: 200, headers });
    }

    if (request.method === "GET" && isStaticAssetPath(url.pathname)) {
      return withEdgeCdnHeaders(finalResponse, url.pathname);
    }

    return finalResponse;
  }
};
