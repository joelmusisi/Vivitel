import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AlertEmailRetryableError,
  alertEmailEventKey,
  createRecipientEmailResolver,
  sendAlertEmailOnce,
  type AlertEmailEnv
} from "./alertEmailDelivery";
import { deviceAlertNotificationNames } from "./deviceAlertDispatch";

const memoryKv = () => {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      }
    } as unknown as KVNamespace
  };
};

const d1WithUsers = (rows: Array<{ id: string; email: string; status: string }>) =>
  ({
    prepare: () => ({ all: async () => ({ results: rows }) })
  }) as unknown as D1Database;

const envWith = (kv: KVNamespace, users: Array<{ id: string; email: string; status: string }> = []): AlertEmailEnv => ({
  ViviTEL: kv,
  VIVI_D1: d1WithUsers(users),
  RESEND_API_KEY: "test-key"
});

const message = { tenantId: "t1", eventKey: "42", to: "Ada@Example.com", subject: "s", text: "t" };

afterEach(() => vi.unstubAllGlobals());

describe("alert email delivery", () => {
  it("sends once per event and recipient", async () => {
    const { kv } = memoryKv();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendAlertEmailOnce(envWith(kv), message)).toBe("sent");
    expect(await sendAlertEmailOnce(envWith(kv), message)).toBe("already-sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries temporary failures and does not mark them sent", async () => {
    const { kv, store } = memoryKv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await expect(sendAlertEmailOnce(envWith(kv), message)).rejects.toBeInstanceOf(AlertEmailRetryableError);
    expect(store.size).toBe(0);
  });

  it("records a permanent rejection so it is not retried every poll", async () => {
    const { kv, store } = memoryKv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid to", { status: 422 })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendAlertEmailOnce(envWith(kv), message)).toBe("rejected");
    expect([...store.values()]).toEqual(["rejected:422"]);
  });

  it("keeps the event open when the Resend key is missing", async () => {
    const { kv } = memoryKv();
    await expect(
      sendAlertEmailOnce({ ...envWith(kv), RESEND_API_KEY: "" }, message)
    ).rejects.toBeInstanceOf(AlertEmailRetryableError);
  });

  it("uses the event id, or device/time/type when there is none", () => {
    expect(alertEmailEventKey({ id: 7 })).toBe("7");
    expect(alertEmailEventKey({ deviceId: 3, eventTime: "2026-10-22T08:00:00Z", type: "alarm" })).toBe(
      "3:2026-10-22T08:00:00Z:alarm"
    );
  });
});

describe("alert recipient addresses", () => {
  it("uses a user's current address and skips inactive users", async () => {
    const { kv } = memoryKv();
    const resolve = createRecipientEmailResolver(
      envWith(kv, [
        { id: "u1", email: "new@example.com", status: "active" },
        { id: "u2", email: "gone@example.com", status: "disabled" }
      ])
    );
    expect(await resolve({ id: "u1", email: "old@example.com" })).toBe("new@example.com");
    expect(await resolve({ id: "u2", email: "gone@example.com" })).toBe("");
    expect(await resolve({ id: "contact-9", email: "Driver@Example.com" })).toBe("driver@example.com");
    expect(await resolve({ id: "u-unknown", email: "saved@example.com" })).toBe("saved@example.com");
  });
});

describe("device alert notification names", () => {
  const rules = [
    { traccarType: "deviceOverspeed", description: "Speeding" },
    { traccarType: "ignitionOn", description: "Ignition On" },
    { traccarType: "alarm", description: "Panic Button" }
  ];

  it("maps a Traccar type to the alert names monitored on the site", () => {
    expect(deviceAlertNotificationNames({ eventType: "deviceOverspeed", rules })).toEqual(["Speeding", "deviceOverspeed"]);
  });

  it("prefers the name the event carries", () => {
    expect(
      deviceAlertNotificationNames({ eventType: "alarm", attributes: { alarm: "Panic Button" }, rules })
    ).toEqual(["Panic Button", "alarm"]);
  });

  it("never lends an unnamed alarm another row's name", () => {
    expect(deviceAlertNotificationNames({ eventType: "alarm", rules })).toEqual(["alarm"]);
  });
});
