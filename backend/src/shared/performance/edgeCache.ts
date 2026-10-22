/**
 * CDN origin + edge cache helpers for Cloudflare Workers and Pages.
 * Layers: browser cache → CDN edge (Tiered Cache) → origin (Worker/KV).
 */

export type CacheLayerHeaders = Record<string, string>;

/** Long-lived hashed assets served from Pages /static — edge + browser immutable. */
export function cdnImmutableAssetHeaders(maxAgeSec = 31_536_000): CacheLayerHeaders {
  return {
    "cache-control": `public, max-age=${maxAgeSec}, immutable`,
    "cdn-cache-control": `max-age=${maxAgeSec}`,
  };
}

/** SPA HTML shells — always revalidate at browser; never cache at CDN edge. */
export function cdnNoStoreHtmlHeaders(): CacheLayerHeaders {
  return {
    "cache-control": "no-cache, no-store, must-revalidate",
    "cdn-cache-control": "no-store",
  };
}

/** Semi-static marketing assets — edge SWR without poisoning HTML routes. */
export function cdnMarketingHeaders(maxAgeSec = 86_400, swrSec = 604_800): CacheLayerHeaders {
  return {
    "cache-control": `public, max-age=${maxAgeSec}, stale-while-revalidate=${swrSec}`,
    "cdn-cache-control": `max-age=${maxAgeSec}`,
  };
}

/** Private API JSON — short browser cache; edge may cache per-URL when auth is in URL/key. */
export function apiPrivateCacheHeaders(ttlSec: number): CacheLayerHeaders {
  const ttl = Math.max(0, Math.floor(ttlSec));
  return {
    "cache-control": `private, max-age=${ttl}`,
    vary: "Accept-Encoding, Authorization, x-api-key, x-tenant-id",
  };
}

const cacheKeyFor = (request: Request) => new Request(request.url, { method: "GET", headers: request.headers });

/** Read from Workers Cache API (per-PoP edge, ~1ms on hit). */
export async function edgeCacheGet(request: Request): Promise<Response | null> {
  try {
    const cache = caches.default;
    return (await cache.match(cacheKeyFor(request))) ?? null;
  } catch {
    return null;
  }
}

/** Store in Workers Cache API; returns the response to forward (cloned body). */
export async function edgeCachePut(request: Request, response: Response, ttlSec: number): Promise<Response> {
  const ttl = Math.max(1, Math.floor(ttlSec));
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${ttl}`);
  const cached = new Response(response.body, { status: response.status, headers });
  try {
    await caches.default.put(cacheKeyFor(request), cached.clone());
  } catch {
    // ignore edge write failures — origin response still valid
  }
  return cached;
}

/** Edge cache wrapper: CDN layer in front of KV/DB origin compute. */
export async function withEdgeCache(
  request: Request,
  ttlSec: number,
  compute: () => Promise<Response>
): Promise<Response> {
  if (request.method !== "GET") return compute();
  const hit = await edgeCacheGet(request);
  if (hit) return hit;
  const fresh = await compute();
  if (!fresh.ok) return fresh;
  return edgeCachePut(request, fresh, ttlSec);
}
