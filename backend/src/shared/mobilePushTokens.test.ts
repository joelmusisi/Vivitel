import { beforeEach, describe, expect, it } from "vitest";
import { resetFcmAccessTokenCacheForTests } from "./fcmPush";
import {
  handlePushTokenRequest,
  readPushTokensForUser,
  sendPushToUser,
  type PushTokenRoutePrincipal
} from "./mobilePushTokens";
import { createFakeFcmFetch, createMemoryKv, createTestServiceAccount, UNREGISTERED_REPLY } from "./pushTestSupport";

const alice: PushTokenRoutePrincipal = { kind: "user", userId: "user-alice" };
const bob: PushTokenRoutePrincipal = { kind: "user", userId: "user-bob" };

function request(
  kv: ReturnType<typeof createMemoryKv>,
  method: string,
  value: unknown,
  principal: PushTokenRoutePrincipal = alice,
  tenantId = "tenant-a"
) {
  return handlePushTokenRequest(kv, { method, principal, tenantId, body: { ok: true, value } });
}

describe("/api/mobile/push-tokens", () => {
  it("rejects other methods, signed-out callers and missing tenant", async () => {
    const kv = createMemoryKv();
    expect((await request(kv, "GET", null)).status).toBe(405);
    expect((await request(kv, "POST", { token: "t", platform: "ios" }, { kind: "none" })).status).toBe(401);
    expect((await request(kv, "POST", { token: "t", platform: "ios" }, alice, "")).status).toBe(400);
    const admin = await request(kv, "POST", { token: "t", platform: "ios" }, { kind: "admin" });
    expect(admin).toMatchObject({ status: 200, body: { stored: false, skipped: true } });
    expect(kv.store.size).toBe(0);
  });

  it("validates the body", async () => {
    const kv = createMemoryKv();
    expect((await request(kv, "POST", { platform: "ios" })).body.error).toBe("token is required");
    expect((await request(kv, "POST", { token: "t", platform: "web" })).status).toBe(400);
    expect((await request(kv, "POST", { token: "x".repeat(5000), platform: "android" })).status).toBe(400);
    const badJson = await handlePushTokenRequest(kv, {
      method: "POST",
      principal: alice,
      tenantId: "tenant-a",
      body: { ok: false, error: "Invalid JSON body." }
    });
    expect(badJson).toEqual({ status: 400, body: { error: "Invalid JSON body." } });
  });

  it("POST upserts the token for the user and tenant; DELETE removes it", async () => {
    const kv = createMemoryKv();
    const first = await request(kv, "POST", { token: "phone-1", platform: "android" });
    expect(first).toMatchObject({ status: 200, body: { stored: true, platform: "android", tenantId: "tenant-a" } });
    await request(kv, "POST", { token: "tablet-1", platform: "ios" });
    await request(kv, "POST", { token: "phone-1", platform: "android" });

    const tokens = await readPushTokensForUser(kv, "tenant-a", "user-alice");
    expect(tokens.map((row) => row.token)).toEqual(["phone-1", "tablet-1"]);
    expect(await readPushTokensForUser(kv, "tenant-b", "user-alice")).toEqual([]);

    expect((await request(kv, "DELETE", { token: "phone-1", platform: "android" })).body).toEqual({
      deleted: true,
      tenantId: "tenant-a"
    });
    expect((await request(kv, "DELETE", { token: "phone-1", platform: "android" })).body.deleted).toBe(false);
    expect((await readPushTokensForUser(kv, "tenant-a", "user-alice")).map((row) => row.token)).toEqual(["tablet-1"]);
  });

  it("moves a device to whoever signed in on it last", async () => {
    const kv = createMemoryKv();
    await request(kv, "POST", { token: "shared-phone", platform: "android" }, alice);
    await request(kv, "POST", { token: "shared-phone", platform: "android" }, bob);
    expect(await readPushTokensForUser(kv, "tenant-a", "user-alice")).toEqual([]);
    expect((await readPushTokensForUser(kv, "tenant-a", "user-bob")).map((row) => row.token)).toEqual(["shared-phone"]);

    // Alice's late sign-out must not unlink Bob's device.
    await request(kv, "DELETE", { token: "shared-phone", platform: "android" }, alice);
    expect((await readPushTokensForUser(kv, "tenant-a", "user-bob")).map((row) => row.token)).toEqual(["shared-phone"]);
  });
});

describe("sendPushToUser", () => {
  beforeEach(() => resetFcmAccessTokenCacheForTests());

  const notification = { title: "Speed Limit Exceeded", body: "Truck 12 · Depot", data: { screen: "map" } };

  it("skips users without devices and deployments without the secret", async () => {
    const kv = createMemoryKv();
    const fake = createFakeFcmFetch();
    const env = { FCM_SERVICE_ACCOUNT_JSON: (await createTestServiceAccount()).json };
    expect(await sendPushToUser(env, kv, { tenantId: "tenant-a", userId: "user-alice", notification }, fake.fetchImpl))
      .toMatchObject({ sent: 0, skipped: "no devices" });

    await request(kv, "POST", { token: "phone-1", platform: "android" });
    expect(await sendPushToUser({}, kv, { tenantId: "tenant-a", userId: "user-alice", notification }, fake.fetchImpl))
      .toMatchObject({ sent: 0, skipped: "FCM_SERVICE_ACCOUNT_JSON not configured" });
    expect(fake.calls).toHaveLength(0);
  });

  it("sends to every device and drops tokens FCM reports as unregistered", async () => {
    const kv = createMemoryKv();
    await request(kv, "POST", { token: "phone-1", platform: "android" });
    await request(kv, "POST", { token: "old-phone", platform: "ios" });
    await request(kv, "POST", { token: "flaky-phone", platform: "ios" });
    const fake = createFakeFcmFetch((token) =>
      token === "old-phone" ? UNREGISTERED_REPLY : token === "flaky-phone" ? { status: 503, body: {} } : { status: 200 }
    );
    const env = { FCM_SERVICE_ACCOUNT_JSON: (await createTestServiceAccount()).json };

    const summary = await sendPushToUser(env, kv, { tenantId: "tenant-a", userId: "user-alice", notification }, fake.fetchImpl);
    expect(summary).toEqual({ sent: 1, failed: 1, removed: 1 });

    const sends = fake.calls.filter((call) => call.url.startsWith("https://fcm.googleapis.com/"));
    expect(sends).toHaveLength(3);
    expect(JSON.parse(sends[0].body).message).toMatchObject({
      notification: { title: "Speed Limit Exceeded", body: "Truck 12 · Depot" },
      data: { screen: "map" }
    });
    // A temporary failure keeps the token; only the unregistered one is forgotten.
    expect((await readPushTokensForUser(kv, "tenant-a", "user-alice")).map((row) => row.token).sort()).toEqual([
      "flaky-phone",
      "phone-1"
    ]);
  });

  it("never throws when the OAuth exchange fails", async () => {
    const kv = createMemoryKv();
    await request(kv, "POST", { token: "phone-1", platform: "android" });
    const env = { FCM_SERVICE_ACCOUNT_JSON: (await createTestServiceAccount()).json };
    const failingFetch = async () => new Response("{}", { status: 401 });
    expect(await sendPushToUser(env, kv, { tenantId: "tenant-a", userId: "user-alice", notification }, failingFetch))
      .toEqual({ sent: 0, failed: 1, removed: 0 });
    expect(await readPushTokensForUser(kv, "tenant-a", "user-alice")).toHaveLength(1);
  });
});
