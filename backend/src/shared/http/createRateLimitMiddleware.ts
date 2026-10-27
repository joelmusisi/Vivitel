import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

export type ExpressRateLimitOptions = {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  message?: string;
  onLimited?: () => void;
};

function defaultKey(req: Request): string {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const ip = forwarded || req.socket.remoteAddress || "unknown";
  return `${ip}:${req.method}:${req.baseUrl || req.path}`;
}

/**
 * Lightweight in-memory sliding-window rate limiter for the VPS Express server.
 * Returns HTTP 429 with a Retry-After header when the window is exceeded.
 */
export function createRateLimitMiddleware(options: ExpressRateLimitOptions) {
  const {
    windowMs,
    max,
    keyFn = defaultKey,
    skip,
    message = "Too many requests. Please retry shortly.",
    onLimited,
  } = options;
  const buckets = new Map<string, Bucket>();

  const pruneExpired = (now: number) => {
    if (buckets.size < 5000) return;
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (skip?.(req)) {
      next();
      return;
    }
    const now = Date.now();
    pruneExpired(now);
    const key = keyFn(req);
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      onLimited?.();
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message,
        retryAfterSec,
      });
      return;
    }
    next();
  };
}
