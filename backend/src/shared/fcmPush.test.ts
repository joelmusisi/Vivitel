import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFcmMessage,
  buildServiceAccountAssertion,
  getFcmAccessToken,
  isUnregisteredFcmError,
  parseFcmServiceAccount,
  resetFcmAccessTokenCacheForTests,
  sendFcmMessage
} from "./fcmPush";
import { createFakeFcmFetch, createTestServiceAccount, UNREGISTERED_REPLY } from "./pushTestSupport";

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

describe("fcmPush", () => {
  beforeEach(() => resetFcmAccessTokenCacheForTests());

  it("reads the service-account secret, including escaped newlines", async () => {
    const { json } = await createTestServiceAccount();
    const escaped = json.replace(/\\n/g, "\\\\n");
    const account = parseFcmServiceAccount(escaped);
    expect(account?.projectId).toBe("vivi-test");
    expect(account?.privateKey.startsWith("-----BEGIN PRIVATE KEY-----\n")).toBe(true);
    expect(parseFcmServiceAccount("")).toBeNull();
    expect(parseFcmServiceAccount("{not json")).toBeNull();
    expect(parseFcmServiceAccount(JSON.stringify({ project_id: "x" }))).toBeNull();
  });

  it("signs an RS256 assertion Google can verify", async () => {
    const { json, publicKey } = await createTestServiceAccount();
    const account = parseFcmServiceAccount(json)!;
    const jwt = await buildServiceAccountAssertion(account, Date.UTC(2026, 9, 27, 12));
    const [header, claims, signature] = jwt.split(".");
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64UrlDecode(signature),
      new TextEncoder().encode(`${header}.${claims}`)
    );
    expect(valid).toBe(true);
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)));
    expect(payload).toMatchObject({
      iss: "push@vivi-test.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token"
    });
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it("caches the OAuth access token until it nears expiry", async () => {
    const account = parseFcmServiceAccount((await createTestServiceAccount()).json)!;
    const fake = createFakeFcmFetch();
    const now = Date.now();
    expect(await getFcmAccessToken(account, fake.fetchImpl, now)).toBe("access-1");
    await getFcmAccessToken(account, fake.fetchImpl, now + 30 * 60_000);
    expect(fake.calls).toHaveLength(1);
    await getFcmAccessToken(account, fake.fetchImpl, now + 59.5 * 60_000);
    expect(fake.calls).toHaveLength(2);
  });

  it("sends the v1 message with notification, data and platform options", async () => {
    const account = parseFcmServiceAccount((await createTestServiceAccount()).json)!;
    const fake = createFakeFcmFetch();
    const result = await sendFcmMessage(
      account,
      "access-1",
      "device-a",
      { title: "Overspeed", body: "Truck 12", data: { url: "https://us.vivitelematics.ca/Track/fleet/assets" } },
      fake.fetchImpl
    );
    expect(result).toBe("sent");
    expect(fake.calls[0].url).toBe("https://fcm.googleapis.com/v1/projects/vivi-test/messages:send");
    expect(fake.calls[0].headers.authorization).toBe("Bearer access-1");
    expect(JSON.parse(fake.calls[0].body)).toEqual(
      buildFcmMessage("device-a", {
        title: "Overspeed",
        body: "Truck 12",
        data: { url: "https://us.vivitelematics.ca/Track/fleet/assets" }
      })
    );
    expect(JSON.parse(fake.calls[0].body).message).toMatchObject({
      token: "device-a",
      notification: { title: "Overspeed", body: "Truck 12" },
      data: { url: "https://us.vivitelematics.ca/Track/fleet/assets" }
    });
  });

  it("tells unregistered tokens apart from other failures", async () => {
    expect(isUnregisteredFcmError(UNREGISTERED_REPLY.status, UNREGISTERED_REPLY.body)).toBe(true);
    expect(isUnregisteredFcmError(400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "UNREGISTERED" }] } })).toBe(true);
    expect(isUnregisteredFcmError(400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "INVALID_ARGUMENT" }] } })).toBe(false);
    expect(isUnregisteredFcmError(503, { error: { status: "UNAVAILABLE" } })).toBe(false);
    expect(isUnregisteredFcmError(401, null)).toBe(false);

    const account = parseFcmServiceAccount((await createTestServiceAccount()).json)!;
    const fake = createFakeFcmFetch((token) => (token === "dead" ? UNREGISTERED_REPLY : { status: 500, body: {} }));
    expect(await sendFcmMessage(account, "a", "dead", { title: "t", body: "b" }, fake.fetchImpl)).toBe("unregistered");
    expect(await sendFcmMessage(account, "a", "flaky", { title: "t", body: "b" }, fake.fetchImpl)).toBe("failed");
  });
});
