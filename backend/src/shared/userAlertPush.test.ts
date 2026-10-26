import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFcmAccessTokenCacheForTests } from "./fcmPush";
import { upsertPushToken } from "./mobilePushTokens";
import { createFakeFcmFetch, createMemoryKv, createTestServiceAccount } from "./pushTestSupport";
import {
  appendInAppAlert,
  buildUserAlertPushNotification,
  readUserAlertsForUser,
  type UserAlertDispatchEnv,
  type ViviUserAlertRecord
} from "./userAlertDispatch";

function alert(overrides: Partial<ViviUserAlertRecord> = {}): ViviUserAlertRecord {
  return {
    id: "traccar-event-77:user-alice",
    tenantId: "tenant-a",
    userId: "user-alice",
    eventLabel: "Speed Limit Exceeded",
    assetLabel: "Truck 12",
    site: "Lusaka",
    locationName: "Depot gate",
    message: "Event: Speed Limit Exceeded\nAsset: Truck 12",
    severity: "critical",
    createdAt: new Date().toISOString(),
    channels: { inApp: true },
    read: false,
    ...overrides
  };
}

describe("user alert push channel", () => {
  let kv: ReturnType<typeof createMemoryKv>;
  let env: UserAlertDispatchEnv;
  let fake: ReturnType<typeof createFakeFcmFetch>;

  beforeEach(async () => {
    resetFcmAccessTokenCacheForTests();
    kv = createMemoryKv();
    fake = createFakeFcmFetch();
    vi.stubGlobal("fetch", fake.fetchImpl);
    env = {
      ViviTEL: kv as unknown as KVNamespace,
      VIVI_D1: {} as D1Database,
      FCM_SERVICE_ACCOUNT_JSON: (await createTestServiceAccount()).json
    };
    await upsertPushToken(kv, { tenantId: "tenant-a", userId: "user-alice", token: "phone-1", platform: "android" });
  });

  afterEach(() => vi.unstubAllGlobals());

  const fcmSends = () => fake.calls.filter((call) => call.url.startsWith("https://fcm.googleapis.com/"));

  it("pushes a new in-app alert to the recipient's devices once", async () => {
    await appendInAppAlert(env, alert());
    // A retried poll re-appends the same alert: it must not buzz the phone again.
    await appendInAppAlert(env, alert());

    expect(fcmSends()).toHaveLength(1);
    expect(JSON.parse(fcmSends()[0].body).message).toEqual(
      expect.objectContaining({
        token: "phone-1",
        notification: { title: "Speed Limit Exceeded", body: "Truck 12 · Depot gate" },
        data: { screen: "map", alertId: "traccar-event-77:user-alice" }
      })
    );
    expect(await readUserAlertsForUser(env, "tenant-a", "user-alice")).toHaveLength(1);
  });

  it("does not push stale alerts or alerts for users without devices", async () => {
    await appendInAppAlert(env, alert({ id: "old", createdAt: "2020-01-01T00:00:00Z" }));
    await appendInAppAlert(env, alert({ id: "bob-alert", userId: "user-bob" }));
    expect(fcmSends()).toHaveLength(0);
    expect(await readUserAlertsForUser(env, "tenant-a", "user-alice")).toHaveLength(1);
  });

  it("still records the in-app alert when FCM is down", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    await appendInAppAlert(env, alert());
    expect(await readUserAlertsForUser(env, "tenant-a", "user-alice")).toHaveLength(1);
  });

  it("falls back to the site, then the message, for the push body", () => {
    expect(buildUserAlertPushNotification(alert({ locationName: undefined })).body).toBe("Truck 12 · Lusaka");
    expect(buildUserAlertPushNotification(alert({ assetLabel: "", locationName: undefined, site: undefined })).body).toBe(
      "Event: Speed Limit Exceeded"
    );
  });
});
