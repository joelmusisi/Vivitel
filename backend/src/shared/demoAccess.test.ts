import { describe, expect, it } from "vitest";
import {
  DEMO_EXPIRED_MESSAGE,
  DEMO_TRIAL_MS,
  activateDemoRecord,
  advanceDemoOnLogin,
  buildDemoOnboardingMessages,
  claimDemoNotifications,
  clearDemoAccessCache,
  createPendingDemoRecord,
  demoBlocksAccess,
  demoSharedHierarchyVisible,
  mergeActiveDemoPermissions,
  parseSupportNotifyEmails,
  toPublicDemoStatus
} from "./demoAccess";

const START = Date.parse("2026-10-03T12:00:00.000Z");

describe("demo access", () => {
  it("keeps support addresses out of the public status", () => {
    clearDemoAccessCache();
    const record = advanceDemoOnLogin(
      createPendingDemoRecord({
        userId: "user-1",
        email: "client@example.com",
        name: "Ada",
        nowIso: new Date(START).toISOString()
      }),
      START
    ).record;
    const status = toPublicDemoStatus(record, START + 1000);
    expect(status).toMatchObject({
      active: true,
      expired: false,
      daysRemaining: 14,
      showTour: true
    });
    expect(JSON.stringify(status)).not.toContain("@");
    expect(JSON.stringify(status)).not.toContain("client@example.com");
  });

  it("starts one continuous 14-day window and then blocks", () => {
    const pending = createPendingDemoRecord({
      userId: "user-1",
      email: "client@example.com",
      name: "Ada",
      nowIso: new Date(START).toISOString()
    });
    expect(demoBlocksAccess(pending, START)).toBe(false);
    const first = advanceDemoOnLogin(pending, START);
    expect(first.changed).toBe(true);
    expect(first.blocked).toBe(false);
    expect(Date.parse(first.record!.expiresAt!) - Date.parse(first.record!.startedAt!)).toBe(DEMO_TRIAL_MS);

    const second = advanceDemoOnLogin(first.record, START + 3 * 24 * 60 * 60 * 1000);
    expect(second.changed).toBe(false);
    expect(second.record?.startedAt).toBe(first.record?.startedAt);

    const expired = advanceDemoOnLogin(first.record, START + DEMO_TRIAL_MS);
    expect(expired.blocked).toBe(true);
    expect(expired.blockMessage).toBe(DEMO_EXPIRED_MESSAGE);
    expect(toPublicDemoStatus(first.record, START + DEMO_TRIAL_MS)?.active).toBe(false);

    const activated = activateDemoRecord(first.record!, new Date(START + DEMO_TRIAL_MS).toISOString());
    expect(advanceDemoOnLogin(activated, START + DEMO_TRIAL_MS + 1000).blocked).toBe(false);
    expect(toPublicDemoStatus(activated, START + DEMO_TRIAL_MS + 1000)).toMatchObject({
      active: true,
      expired: false,
      activated: true,
      showTour: false
    });
  });

  it("keeps the shared demo site until day 14 even after activation", () => {
    const pending = createPendingDemoRecord({
      userId: "user-1",
      email: "client@example.com",
      name: "Sten",
      nowIso: new Date(START).toISOString(),
      organisationName: "Sten Org",
      dealerName: "Sten Dealer",
      databaseName: "Sten DB",
      siteName: "Sten",
      personalTenantId: "sten-org:sten-dealer:sten-db"
    });
    expect(demoSharedHierarchyVisible(pending, START)).toBe(true);
    const started = advanceDemoOnLogin(pending, START).record!;
    const activated = activateDemoRecord(started, new Date(START + 2 * 24 * 60 * 60 * 1000).toISOString());
    expect(demoSharedHierarchyVisible(activated, START + 3 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(demoSharedHierarchyVisible(activated, START + DEMO_TRIAL_MS)).toBe(false);
    expect(advanceDemoOnLogin(activated, START + DEMO_TRIAL_MS + 1000).blocked).toBe(false);
  });

  it("claims onboarding mail once and skips support when it is not configured", () => {
    const started = advanceDemoOnLogin(
      createPendingDemoRecord({
        userId: "user-1",
        email: "client@example.com",
        name: "Ada",
        nowIso: new Date(START).toISOString()
      }),
      START
    ).record!;
    const first = claimDemoNotifications(started, START, { supportConfigured: true });
    expect(first.sendClient).toBe(true);
    expect(first.sendSupport).toBe(true);
    const again = claimDemoNotifications(first.record, START + 30_000, { supportConfigured: true });
    expect(again.sendClient).toBe(false);
    expect(again.sendSupport).toBe(false);

    const withoutSupport = claimDemoNotifications(started, START, { supportConfigured: false });
    expect(withoutSupport.sendClient).toBe(true);
    expect(withoutSupport.sendSupport).toBe(false);
    expect(withoutSupport.record.supportNotifyClaimAt).toBeNull();
  });

  it("parses at most four support inboxes and ignores junk", () => {
    expect(
      parseSupportNotifyEmails(" A@Vivitel.com, a@vivitel.com; bad not-an-email b@vivitel.com c@vivitel.com d@vivitel.com e@vivitel.com ")
    ).toEqual(["a@vivitel.com", "b@vivitel.com", "c@vivitel.com", "d@vivitel.com"]);
  });

  it("adds setup pages only while the demo is active", () => {
    const pending = createPendingDemoRecord({
      userId: "user-1",
      email: "client@example.com",
      name: "Ada",
      nowIso: new Date(START).toISOString()
    });
    const started = advanceDemoOnLogin(pending, START).record!;
    const rows = [{ pagePath: "/Track/fleet/assets", view: true, edit: false, delete: false }];
    const active = mergeActiveDemoPermissions(rows, started, START + 1000);
    expect(active).toEqual(
      expect.arrayContaining([
        { pagePath: "/Track/fleet/assets", view: true, edit: true, delete: false },
        { pagePath: "/Control/config/configuration-groups", view: true, edit: true, delete: false }
      ])
    );
    expect(mergeActiveDemoPermissions(rows, started, START + DEMO_TRIAL_MS)).toEqual(rows);
    expect(mergeActiveDemoPermissions(rows, null, START)).toEqual(rows);
  });

  it("does not put support inboxes in the onboarding copy builder output keys", () => {
    const messages = buildDemoOnboardingMessages({
      name: "Ada",
      email: "client@example.com",
      startedAt: new Date(START).toISOString(),
      expiresAt: new Date(START + DEMO_TRIAL_MS).toISOString(),
      signInUrl: "https://us.vivitelematics.ca/login"
    });
    expect(messages.client.subject).toContain("demo is active");
    expect(messages.client.text).toContain("configuration group");
    expect(messages.support.text).toContain("client@example.com");
    expect(messages.client.text).not.toContain("support@");
  });
});
