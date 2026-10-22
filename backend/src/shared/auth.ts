import express from "express";
import crypto from "crypto";

// Global constants - initialized by vps_server.ts
declare let ADMIN_PASSWORD: string;
declare let ADMIN_PASSWORD_HASH: string;

export function timingSafeEq(a: string, b: string) {
  const ab = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyAdminPassword(plain: string) {
  if (ADMIN_PASSWORD_HASH && ADMIN_PASSWORD_HASH.startsWith("scrypt:")) {
    try {
      const parts = ADMIN_PASSWORD_HASH.split(":");
      const saltHex = parts[1] ?? "";
      const hashHex = parts[2] ?? "";
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");
      if (!salt.length || !expected.length) return false;
      const derived = crypto.scryptSync(String(plain ?? ""), salt, expected.length);
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (!ADMIN_PASSWORD) return false;
  return timingSafeEq(ADMIN_PASSWORD, String(plain ?? ""));
}

export function readAuthToken(req: express.Request) {
  const header = String(req.header("x-api-key") ?? "").trim();
  if (header) return header;
  const auth = String(req.header("authorization") ?? "").trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? String(m[1] ?? "").trim() : "";
}

export function normalizeTenantId(rawTenant: string) {
  const raw = String(rawTenant ?? "").trim();
  if (!raw) return "";
  const parts = raw
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean);
  // tenant is database-scoped: dealer:org:db (ignore site)
  if (parts.length >= 3) return parts.slice(0, 3).join(":");
  return raw;
}

export function readTenant(req: express.Request) {
  const raw = String(req.header("x-tenant-id") ?? (req.query as any)?.tenant ?? "").trim();
  const tenant = normalizeTenantId(raw);
  return { raw, tenant };
}
