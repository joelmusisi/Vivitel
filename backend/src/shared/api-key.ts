import express from "express";
import { readAuthToken } from "./auth";

// Global state/constants - initialized by vps_server.ts
declare let API_KEY: string;
declare let db: any;

type AdminSessionHotCacheEntry = {
  expiresAtMs: number;
  touchedAtMs: number;
};

const ADMIN_SESSION_HOT_CACHE_MAX_ENTRIES = 5_000;
const ADMIN_SESSION_HOT_CACHE_PRUNE_EVERY = 250;
const adminSessionHotCache = new Map<string, AdminSessionHotCacheEntry>();
const adminSessionHotCacheStats = {
  hits: 0,
  misses: 0,
  dbHits: 0,
  dbMisses: 0,
  expired: 0,
  prunes: 0,
};
let adminSessionHotCacheChecks = 0;

const parseExpiryMs = (expiresAt: string) => {
  const parsed = Date.parse(String(expiresAt ?? "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

function pruneAdminSessionHotCache(nowMs: number, force = false) {
  adminSessionHotCacheChecks += 1;
  if (!force && adminSessionHotCacheChecks % ADMIN_SESSION_HOT_CACHE_PRUNE_EVERY !== 0) return;

  let removed = 0;
  for (const [token, entry] of adminSessionHotCache) {
    if (entry.expiresAtMs > nowMs) continue;
    adminSessionHotCache.delete(token);
    removed += 1;
  }

  if (adminSessionHotCache.size > ADMIN_SESSION_HOT_CACHE_MAX_ENTRIES) {
    const overflow = adminSessionHotCache.size - ADMIN_SESSION_HOT_CACHE_MAX_ENTRIES;
    let trimmed = 0;
    for (const token of adminSessionHotCache.keys()) {
      adminSessionHotCache.delete(token);
      trimmed += 1;
      if (trimmed >= overflow) break;
    }
    removed += trimmed;
  }

  if (removed > 0) adminSessionHotCacheStats.prunes += removed;
}

export function rememberAdminSessionToken(token: string, expiresAt: string) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) return;

  const expiresAtMs = parseExpiryMs(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    adminSessionHotCache.delete(cleanToken);
    return;
  }

  const nowMs = Date.now();
  if (expiresAtMs <= nowMs) {
    adminSessionHotCache.delete(cleanToken);
    return;
  }

  if (adminSessionHotCache.has(cleanToken)) {
    adminSessionHotCache.delete(cleanToken);
  }
  adminSessionHotCache.set(cleanToken, { expiresAtMs, touchedAtMs: nowMs });
  pruneAdminSessionHotCache(nowMs, adminSessionHotCache.size > ADMIN_SESSION_HOT_CACHE_MAX_ENTRIES);
}

export function forgetAdminSessionToken(token: string) {
  const cleanToken = String(token ?? "").trim();
  if (!cleanToken) return;
  adminSessionHotCache.delete(cleanToken);
}

export function getAdminSessionHotCacheStats() {
  return {
    size: adminSessionHotCache.size,
    maxEntries: ADMIN_SESSION_HOT_CACHE_MAX_ENTRIES,
    hits: adminSessionHotCacheStats.hits,
    misses: adminSessionHotCacheStats.misses,
    dbHits: adminSessionHotCacheStats.dbHits,
    dbMisses: adminSessionHotCacheStats.dbMisses,
    expired: adminSessionHotCacheStats.expired,
    prunes: adminSessionHotCacheStats.prunes,
  };
}

export function requireApiKey(req: express.Request, res: express.Response) {
  if (!API_KEY) return true;
  const key = readAuthToken(req);
  if (!key) return false;
  if (key === API_KEY) return true;

  const nowMs = Date.now();
  pruneAdminSessionHotCache(nowMs);
  const cached = adminSessionHotCache.get(key);
  if (cached) {
    if (cached.expiresAtMs > nowMs) {
      adminSessionHotCacheStats.hits += 1;
      cached.touchedAtMs = nowMs;
      return true;
    }
    adminSessionHotCache.delete(key);
    adminSessionHotCacheStats.expired += 1;
  }

  adminSessionHotCacheStats.misses += 1;
  try {
    const row = db
      .prepare("SELECT token, expires_at FROM admin_sessions WHERE token = ? ORDER BY expires_at DESC LIMIT 1")
      .get(key);
    if (!row) {
      adminSessionHotCacheStats.dbMisses += 1;
      return false;
    }
    const expiresAt = String(row.expires_at ?? "");
    if (!expiresAt) {
      adminSessionHotCacheStats.dbMisses += 1;
      return false;
    }
    const expiresAtMs = parseExpiryMs(expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      adminSessionHotCacheStats.dbMisses += 1;
      return false;
    }
    adminSessionHotCacheStats.dbHits += 1;
    rememberAdminSessionToken(key, expiresAt);
    return true;
  } catch {
    adminSessionHotCacheStats.dbMisses += 1;
    return false;
  }
}

export function isLoopbackRequest(req: express.Request) {
  const ipRaw = String(req.ip ?? req.socket?.remoteAddress ?? "").trim();
  const forwardedRaw = String(req.header("x-forwarded-for") ?? "").trim();
  const firstForwarded = forwardedRaw.split(",")[0]?.trim() ?? "";
  const candidates = [ipRaw, firstForwarded].filter(Boolean);
  return candidates.some((ip) => {
    const normalized = ip.toLowerCase();
    return (
      normalized === "127.0.0.1" ||
      normalized === "::1" ||
      normalized === "::ffff:127.0.0.1" ||
      normalized.startsWith("127.")
    );
  });
}
