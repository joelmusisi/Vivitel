/**
 * Per-account application preferences (localStorage).
 *
 * Policy:
 * - Asset, fleet, config, library, and location *data* is site/tenant shared.
 *   Every user with access loads the same server copy. Do not use these helpers for that data.
 * - One account only: report subscriptions, subscription contacts, alert/stream subscriptions,
 *   personal settings, and UI picks (open asset, column layout, trip timeline).
 */

import {
  readActiveTenantId,
  readActiveUserId,
  tenantStorageKey,
  userStorageKey
} from "./tenantContext";

export const USER_PREF_KEYS = {
  activeAsset: "vivi.activeAsset",
  activeRegistration: "vivi.activeRegistration",
  activeImei: "vivi.activeImei",
  contextType: "vivi.contextType",
  contextName: "vivi.contextName",
  tripTimelineStart: "vivi.tripTimelineStart",
  tripTimelineEnd: "vivi.tripTimelineEnd",
  tripTimelineAsset: "vivi.tripTimelineAsset",
  tripTimelineSelectedNotifications: "vivi.tripTimeline.selectedNotifications",
  assetsColumnPrefs: "vivi.assets.columnPrefs"
} as const;

function legacyTenantKey(base: string, tenantId = readActiveTenantId()): string {
  return tenantStorageKey(base, tenantId);
}

/**
 * Read a string preference for the active account.
 * Migrates legacy flat / tenant keys into the user-scoped key on first read.
 */
export function readUserPref(base: string, tenantId = readActiveTenantId(), userId = readActiveUserId()): string {
  if (typeof window === "undefined") return "";
  const userKey = userStorageKey(base, tenantId, userId);
  try {
    const scoped = String(window.localStorage.getItem(userKey) ?? "").trim();
    if (scoped) return scoped;

    const legacyTenant = String(window.localStorage.getItem(legacyTenantKey(base, tenantId)) ?? "").trim();
    const legacyFlat = String(window.localStorage.getItem(base) ?? "").trim();
    const legacy = legacyTenant || legacyFlat;
    if (!legacy) return "";

    if (userId) {
      try {
        window.localStorage.setItem(userKey, legacy);
      } catch {
        // ignore migrate write failures
      }
    }
    return legacy;
  } catch {
    return "";
  }
}

/** Write a string preference for the active account only (no flat shared write). */
export function writeUserPref(
  base: string,
  value: string,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
) {
  if (typeof window === "undefined") return;
  const next = String(value ?? "");
  try {
    const key = userStorageKey(base, tenantId, userId);
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearUserPref(base: string, tenantId = readActiveTenantId(), userId = readActiveUserId()) {
  writeUserPref(base, "", tenantId, userId);
}

/** Read JSON preference for the active account; migrates legacy tenant/flat JSON once. */
export function readUserPrefJson<T>(
  base: string,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
): T | null {
  if (typeof window === "undefined") return null;
  const userKey = userStorageKey(base, tenantId, userId);
  try {
    const scopedRaw = window.localStorage.getItem(userKey);
    if (scopedRaw) return JSON.parse(scopedRaw) as T;

    const legacyTenantRaw = window.localStorage.getItem(legacyTenantKey(base, tenantId));
    const legacyFlatRaw = window.localStorage.getItem(base);
    const legacyRaw = legacyTenantRaw || legacyFlatRaw;
    if (!legacyRaw) return null;

    const parsed = JSON.parse(legacyRaw) as T;
    if (userId) {
      try {
        window.localStorage.setItem(userKey, legacyRaw);
      } catch {
        // ignore
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeUserPrefJson(
  base: string,
  value: unknown,
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
) {
  if (typeof window === "undefined") return;
  try {
    const key = userStorageKey(base, tenantId, userId);
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearActiveAssetPrefs(tenantId = readActiveTenantId(), userId = readActiveUserId()) {
  clearUserPref(USER_PREF_KEYS.activeAsset, tenantId, userId);
  clearUserPref(USER_PREF_KEYS.activeRegistration, tenantId, userId);
  clearUserPref(USER_PREF_KEYS.activeImei, tenantId, userId);
}

export function writeActiveAssetPrefs(
  prefs: { asset?: string; registration?: string; imei?: string },
  tenantId = readActiveTenantId(),
  userId = readActiveUserId()
) {
  if (prefs.asset !== undefined) writeUserPref(USER_PREF_KEYS.activeAsset, prefs.asset, tenantId, userId);
  if (prefs.registration !== undefined) {
    writeUserPref(USER_PREF_KEYS.activeRegistration, prefs.registration, tenantId, userId);
  }
  if (prefs.imei !== undefined) writeUserPref(USER_PREF_KEYS.activeImei, prefs.imei, tenantId, userId);
}
