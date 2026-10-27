/**
 * 14-day demo access.
 * Trial state lives in KV. Support inboxes are read from the worker env only
 * and must never be copied into API responses or the frontend.
 */

export const DEMO_TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
export const DEMO_EXPIRED_MESSAGE =
  "Your 14-day demo has ended. Contact care@vivitelematics.com if you want to keep using Vivi Telematics.";

const CLAIM_WINDOW_MS = 2 * 60 * 1000;
const CACHE_MS = 20_000;
const MAX_SUPPORT_RECIPIENTS = 4;

export type DemoAccessRecord = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  startedAt: string | null;
  expiresAt: string | null;
  clientEmailSentAt: string | null;
  supportEmailSentAt: string | null;
  clientNotifyClaimAt: string | null;
  supportNotifyClaimAt: string | null;
  tourDismissedAt: string | null;
  activatedAt: string | null;
  organisationName: string;
  dealerName: string;
  databaseName: string;
  siteName: string;
  /** Database created for this account at demo signup. The shared Demo database is separate. */
  personalTenantId: string;
};

export type DemoPublicStatus = {
  active: boolean;
  expired: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
  showTour: boolean;
  activated: boolean;
  personalTenantId: string | null;
  /** Shared Demo database while the 14-day window is open. Null after that window, including when the account was activated. */
  sharedDemo: { tenantId: string; siteId: string; siteName: string } | null;
  hierarchy: {
    organisation: string;
    dealer: string;
    database: string;
    site: string;
  } | null;
};

export type DemoKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export type DemoPageGrant = {
  pagePath: string;
  view: boolean;
  edit: boolean;
  delete: boolean;
};

/** Extra pages a demo needs to finish the guided setup. The shared Basic User role is unchanged. */
export const DEMO_ONBOARDING_GRANTS: readonly DemoPageGrant[] = [
  { pagePath: "/Track/fleet/assets", view: true, edit: true, delete: false },
  { pagePath: "/Control/config/configuration-groups", view: true, edit: true, delete: false }
];

const cache = new Map<string, { expiresAt: number; record: DemoAccessRecord | null }>();

export function clearDemoAccessCache() {
  cache.clear();
}

export function demoAccessKey(userId: string) {
  return `vivi:demo-access:${String(userId ?? "").trim()}`;
}

export function parseSupportNotifyEmails(raw: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= MAX_SUPPORT_RECIPIENTS) break;
  }
  return out;
}

function textOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function parseDemoRecord(raw: string | null, userId: string): DemoAccessRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoAccessRecord>;
    const id = String(parsed.userId ?? userId ?? "").trim();
    if (!id) return null;
    return {
      userId: id,
      email: String(parsed.email ?? "").trim().toLowerCase(),
      name: String(parsed.name ?? "").trim(),
      createdAt: String(parsed.createdAt ?? "").trim(),
      startedAt: textOrNull(parsed.startedAt),
      expiresAt: textOrNull(parsed.expiresAt),
      clientEmailSentAt: textOrNull(parsed.clientEmailSentAt),
      supportEmailSentAt: textOrNull(parsed.supportEmailSentAt),
      clientNotifyClaimAt: textOrNull(parsed.clientNotifyClaimAt),
      supportNotifyClaimAt: textOrNull(parsed.supportNotifyClaimAt),
      tourDismissedAt: textOrNull(parsed.tourDismissedAt),
      activatedAt: textOrNull(parsed.activatedAt),
      organisationName: String(parsed.organisationName ?? "").trim(),
      dealerName: String(parsed.dealerName ?? "").trim(),
      databaseName: String(parsed.databaseName ?? "").trim(),
      siteName: String(parsed.siteName ?? "").trim(),
      personalTenantId: String(parsed.personalTenantId ?? "").trim()
    };
  } catch {
    return null;
  }
}

export function createPendingDemoRecord(input: {
  userId: string;
  email: string;
  name: string;
  nowIso: string;
  organisationName?: string;
  dealerName?: string;
  databaseName?: string;
  siteName?: string;
  personalTenantId?: string;
}): DemoAccessRecord {
  return {
    userId: String(input.userId ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    name: String(input.name ?? "").trim(),
    createdAt: input.nowIso,
    startedAt: null,
    expiresAt: null,
    clientEmailSentAt: null,
    supportEmailSentAt: null,
    clientNotifyClaimAt: null,
    supportNotifyClaimAt: null,
    tourDismissedAt: null,
    activatedAt: null,
    organisationName: String(input.organisationName ?? "").trim(),
    dealerName: String(input.dealerName ?? "").trim(),
    databaseName: String(input.databaseName ?? "").trim(),
    siteName: String(input.siteName ?? "").trim(),
    personalTenantId: String(input.personalTenantId ?? "").trim()
  };
}

/** Demo signup stores the account's own organisation, dealer, database, and site. */
export function demoRecordHasPersonalHierarchy(record: DemoAccessRecord | null) {
  if (!record) return false;
  return Boolean(
    record.personalTenantId ||
      record.organisationName ||
      record.dealerName ||
      record.databaseName ||
      record.siteName
  );
}

/**
 * The shared Demo database stays on the account until the 14-day window ends.
 * Activating the account does not remove it early and does not keep it afterwards.
 */
export function demoSharedHierarchyVisible(record: DemoAccessRecord | null, nowMs: number) {
  if (!demoRecordHasPersonalHierarchy(record) || !record) return false;
  if (!record.expiresAt) return true;
  const expires = Date.parse(record.expiresAt);
  if (!Number.isFinite(expires)) return true;
  return expires > nowMs;
}

export async function loadDemoRecord(kv: DemoKv, userId: string): Promise<DemoAccessRecord | null> {
  const id = String(userId ?? "").trim();
  if (!id) return null;
  const hit = cache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.record;
  const record = parseDemoRecord(await kv.get(demoAccessKey(id)), id);
  cache.set(id, { expiresAt: Date.now() + CACHE_MS, record });
  return record;
}

export async function saveDemoRecord(kv: DemoKv, record: DemoAccessRecord): Promise<void> {
  const id = String(record.userId ?? "").trim();
  if (!id) throw new Error("Demo user id is required.");
  await kv.put(demoAccessKey(id), JSON.stringify(record));
  cache.set(id, { expiresAt: Date.now() + CACHE_MS, record });
}

export function demoDaysRemaining(expiresAt: string | null, nowMs: number) {
  const expires = Date.parse(String(expiresAt ?? ""));
  if (!Number.isFinite(expires) || expires <= nowMs) return 0;
  return Math.max(1, Math.ceil((expires - nowMs) / (24 * 60 * 60 * 1000)));
}

export function demoBlocksAccess(record: DemoAccessRecord | null, nowMs: number) {
  if (!record?.startedAt || !record.expiresAt || record.activatedAt) return false;
  const expires = Date.parse(record.expiresAt);
  return Number.isFinite(expires) && expires <= nowMs;
}

export function activateDemoRecord(record: DemoAccessRecord, nowIso: string) {
  return { ...record, activatedAt: record.activatedAt || nowIso };
}

export function toPublicDemoStatus(record: DemoAccessRecord | null, nowMs: number): DemoPublicStatus | null {
  if (!record) return null;
  const activated = Boolean(record.activatedAt);
  const expired = !activated && demoBlocksAccess(record, nowMs);
  const pending = !record.startedAt && !activated;
  const active = activated || pending || (!expired && Boolean(record.startedAt));
  const hierarchy =
    record.organisationName || record.dealerName || record.databaseName || record.siteName
      ? {
          organisation: record.organisationName,
          dealer: record.dealerName,
          database: record.databaseName,
          site: record.siteName
        }
      : null;
  return {
    active,
    expired,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    daysRemaining: activated ? 0 : pending ? 14 : demoDaysRemaining(record.expiresAt, nowMs),
    showTour: !activated && active && !record.tourDismissedAt,
    activated,
    personalTenantId: record.personalTenantId || null,
    sharedDemo: null,
    hierarchy
  };
}

export function advanceDemoOnLogin(record: DemoAccessRecord | null, nowMs: number) {
  if (!record) {
    return { record: null as DemoAccessRecord | null, changed: false, blocked: false, blockMessage: "" };
  }
  if (record.activatedAt) {
    return { record, changed: false, blocked: false, blockMessage: "" };
  }
  if (demoBlocksAccess(record, nowMs)) {
    return { record, changed: false, blocked: true, blockMessage: DEMO_EXPIRED_MESSAGE };
  }
  if (!record.startedAt) {
    const startedAt = new Date(nowMs).toISOString();
    return {
      record: {
        ...record,
        startedAt,
        expiresAt: new Date(nowMs + DEMO_TRIAL_MS).toISOString()
      },
      changed: true,
      blocked: false,
      blockMessage: ""
    };
  }
  return { record, changed: false, blocked: false, blockMessage: "" };
}

export function claimDemoNotifications(
  record: DemoAccessRecord,
  nowMs: number,
  options: { supportConfigured: boolean }
) {
  const next = { ...record };
  const nowIso = new Date(nowMs).toISOString();
  let sendClient = false;
  let sendSupport = false;
  if (next.startedAt && !next.clientEmailSentAt) {
    const claimed = Date.parse(next.clientNotifyClaimAt ?? "");
    const inFlight = Number.isFinite(claimed) && nowMs - claimed < CLAIM_WINDOW_MS;
    if (!inFlight) {
      next.clientNotifyClaimAt = nowIso;
      sendClient = true;
    }
  }
  if (options.supportConfigured && next.startedAt && !next.supportEmailSentAt) {
    const claimed = Date.parse(next.supportNotifyClaimAt ?? "");
    const inFlight = Number.isFinite(claimed) && nowMs - claimed < CLAIM_WINDOW_MS;
    if (!inFlight) {
      next.supportNotifyClaimAt = nowIso;
      sendSupport = true;
    }
  }
  return { record: next, sendClient, sendSupport };
}

export function markDemoNotificationResult(
  record: DemoAccessRecord,
  result: { attemptedClient: boolean; attemptedSupport: boolean; clientSent: boolean; supportSent: boolean },
  nowIso: string
) {
  const next = { ...record };
  if (result.attemptedClient) {
    next.clientNotifyClaimAt = null;
    if (result.clientSent) next.clientEmailSentAt = nowIso;
  }
  if (result.attemptedSupport) {
    next.supportNotifyClaimAt = null;
    if (result.supportSent) next.supportEmailSentAt = nowIso;
  }
  return next;
}

export function dismissDemoTour(record: DemoAccessRecord, nowIso: string) {
  return { ...record, tourDismissedAt: nowIso };
}

export function mergeActiveDemoPermissions<T extends DemoPageGrant>(rows: T[], record: DemoAccessRecord | null, nowMs: number): T[] {
  const status = toPublicDemoStatus(record, nowMs);
  if (!status?.active || status.expired) return rows;
  const merged = new Map<string, T>();
  for (const row of rows) {
    const pagePath = String(row.pagePath ?? "").trim();
    if (!pagePath) continue;
    merged.set(pagePath, { ...row, pagePath });
  }
  for (const grant of DEMO_ONBOARDING_GRANTS) {
    const current = merged.get(grant.pagePath);
    merged.set(grant.pagePath, {
      ...(current ?? grant),
      pagePath: grant.pagePath,
      view: Boolean(current?.view || grant.view),
      edit: Boolean(current?.edit || grant.edit),
      delete: Boolean(current?.delete || grant.delete)
    } as T);
  }
  return Array.from(merged.values());
}

function formatWhen(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso || "Not set";
  return new Date(ms).toUTCString();
}

export function buildDemoOnboardingMessages(input: {
  name: string;
  email: string;
  startedAt: string;
  expiresAt: string;
  signInUrl: string;
}) {
  const name = String(input.name ?? "").trim() || "there";
  const email = String(input.email ?? "").trim().toLowerCase();
  const until = formatWhen(input.expiresAt);
  const started = formatWhen(input.startedAt);
  const signInUrl = String(input.signInUrl ?? "").trim() || "https://us.vivitelematics.ca/login";
  const clientText =
    `Hello ${name},\n\n` +
    `Your Vivi Telematics demo is active.\n\n` +
    `You have 14 days of continuous access with Basic User rights, until ${until}.\n\n` +
    `A short guide is waiting after you sign in. It walks through three steps:\n` +
    `1. Add an asset under Track, Fleet, Assets.\n` +
    `2. Create a configuration group under Control, Config, Configuration groups.\n` +
    `3. Open the asset, attach that configuration group, and commission it.\n\n` +
    `Sign in:\n${signInUrl}\n\n` +
    `Our support team has been asked to follow up. You can also reach care@vivitelematics.com.\n\n` +
    `Vivi Telematics\n`;
  const supportText =
    `A demo account has signed in and needs onboarding follow-up.\n\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n` +
    `Access started: ${started}\n` +
    `Access ends: ${until}\n` +
    `Rights: Basic User, with asset and configuration-group access for the guided setup.\n\n` +
    `Please help them add an asset, create a configuration group, attach it, and commission the asset.\n`;
  return {
    client: {
      subject: "Your Vivi Telematics demo is active",
      text: clientText
    },
    support: {
      subject: `Demo onboarding: ${name} (${email})`,
      text: supportText
    }
  };
}
