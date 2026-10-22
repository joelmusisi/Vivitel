import zlib from "zlib";
import type { Request, Response, NextFunction } from "express";

const gzipAsync = (input: Buffer, level = 6): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    zlib.gzip(input, { level }, (err, result) => (err ? reject(err) : resolve(result)));
  });

/** Async gzip — avoids blocking the Node event loop on large telemetry archives. */
export async function gzipBuffer(input: Buffer, level = 6): Promise<Buffer> {
  return gzipAsync(input, level);
}

const SKIP_PREFIXES = ["/stream/", "/metrics", "/health"];

/**
 * Express gzip for JSON responses. Skips SSE streams and tiny payloads.
 * Complements Cloudflare Pages Brotli/gzip for the VPS origin API.
 */
export function createGzipJsonMiddleware(thresholdBytes = 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "POST") return next();
    if (SKIP_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
    const accept = String(req.headers["accept-encoding"] ?? "");
    if (!accept.includes("gzip")) return next();

    const originalJson = res.json.bind(res);
    res.json = function gzipJson(body: unknown) {
      const payload = JSON.stringify(body);
      if (Buffer.byteLength(payload, "utf8") < thresholdBytes) return originalJson(body);
      void gzipBuffer(Buffer.from(payload, "utf8")).then(
        (compressed) => {
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Vary", "Accept-Encoding");
          res.removeHeader("Content-Length");
          res.status(res.statusCode || 200).send(compressed);
        },
        () => originalJson(body)
      );
      return res;
    } as typeof res.json;
    next();
  };
}
