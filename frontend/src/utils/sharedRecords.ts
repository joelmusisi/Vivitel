/**
 * Who sees a saved change.
 *
 * Shared (site / tenant): asset, fleet, config, libraries, locations, and other
 * operational records. Every signed-in user who can open that site or asset
 * loads the same server copy.
 *
 * One account only: report subscriptions, subscription contacts, alert
 * subscriptions, and stream subscriptions. Personal settings and access tokens
 * stay on the signed-in account as well.
 */

import { loadScopedFromApi, saveScopedToApi } from "./scopeStorage";
import { readUserScopedJson, writeUserScopedJson } from "./tenantContext";

const SUBSCRIPTION_MARKERS = [
  "vivi.reports.subscriptions",
  "vivi.reports.contacts",
  "vivi:user-alert-rules",
  "vivi:user-alerts",
  "vivi:infohub-stream-monitor",
  "infohub:stream",
  "subscription"
];

export function isSubscriptionRecord(base: string): boolean {
  const key = String(base ?? "").trim().toLowerCase();
  if (!key) return false;
  return SUBSCRIPTION_MARKERS.some((marker) => key === marker || key.includes(marker));
}

type SharedEnvelope<T> = { items?: T[] };

/** Site/tenant list. `null` means nothing has been stored yet. */
export async function loadSharedRecords<T>(base: string): Promise<T[] | null> {
  const stored = await loadScopedFromApi<SharedEnvelope<T> | T[]>(base);
  if (!stored) return null;
  if (Array.isArray(stored)) return stored;
  if (Array.isArray(stored.items)) return stored.items;
  return null;
}

/** Write a site/tenant list. Subscription bases are refused. */
export async function saveSharedRecords<T>(base: string, items: T[]): Promise<boolean> {
  if (isSubscriptionRecord(base)) {
    console.error(`[sharedRecords] Refusing shared save for subscription record "${base}".`);
    return false;
  }
  return saveScopedToApi(base, {
    items,
    updatedAt: new Date().toISOString()
  });
}

export function loadAccountRecords<T>(base: string): T[] {
  const stored = readUserScopedJson<T[] | SharedEnvelope<T>>(base);
  if (Array.isArray(stored)) return stored;
  if (stored && Array.isArray(stored.items)) return stored.items;
  return [];
}

export function saveAccountRecords<T>(base: string, items: T[]) {
  writeUserScopedJson(base, items);
}

export type SharedAdminRow = { id: string; cells: string[]; status?: string };

export async function loadSharedAdminRows(base: string): Promise<SharedAdminRow[] | null> {
  const rows = await loadSharedRecords<SharedAdminRow>(base);
  if (!rows) return null;
  return rows.filter((row) => String(row?.id ?? "").trim() && Array.isArray(row.cells));
}

export async function saveSharedAdminRows(base: string, rows: SharedAdminRow[]): Promise<boolean> {
  return saveSharedRecords(base, rows);
}
