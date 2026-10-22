import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionDurationSeconds,
  allowedDeviceActions,
  digitalOutputCommand,
  libraryRowDeviceActions,
  loadAssetDeviceBinding
} from "./alertDeviceActions";
import { buildAlertSmsText, normalizePhoneNumber, sendAlertSmsOnce } from "./alertSms";

const hms = (s: string) => ({ hours: "0", minutes: "0", seconds: s });

describe("buzzer / relay actions", () => {
  it("reads the library row's actions with outputs, delays and durations", () => {
    const actions = libraryRowDeviceActions({
      parameters: {
        actions: {
          buzzer: { enabled: true, delay: hms("5"), duration: "Sound the buzzer for 5 seconds" },
          relayOne: { enabled: true, delay: hms("0"), duration: "Turn the relay drive on for 2 seconds" },
          relayTwo: { enabled: false }
        }
      }
    });
    expect(actions).toEqual([
      { kind: "buzzer", output: 2, delayMs: 5000, seconds: 5 },
      { kind: "relayOne", output: 1, delayMs: 0, seconds: 2 }
    ]);
    expect(actionDurationSeconds("Sound buzzer continuously when the condition is true")).toBeNull();
    expect(actionDurationSeconds("Sound the buzzer for 1 second")).toBe(1);
  });

  it("builds Teltonika setdigout commands (DOUT1 relay 1, DOUT2 buzzer / relay 2)", () => {
    expect(digitalOutputCommand(1, true, 2)).toBe("setdigout 1? 2");
    expect(digitalOutputCommand(2, true, 5)).toBe("setdigout ?1 0 5");
    expect(digitalOutputCommand(2, true, null)).toBe("setdigout ?1");
    expect(digitalOutputCommand(2, false)).toBe("setdigout ?0");
  });

  it("follows the device binding master switches", () => {
    expect([...allowedDeviceActions(null)]).toEqual(["buzzer"]);
    expect([...allowedDeviceActions({ advancedSettings: { buzzerEnabled: false } })]).toEqual([]);
    expect([...allowedDeviceActions({ advancedSettings: { buzzerEnabled: true, relayAlertsEnabled: true } })]).toEqual([
      "buzzer",
      "relayOne",
      "relayTwo"
    ]);
  });

  it("finds the asset's device binding through its configuration group on the same site", async () => {
    const tables: Record<string, unknown[]> = {
      configuration_groups: [{ name: "Trucks", site: "Mmulu Company", deviceBinding: "FMB Trucks" }],
      bindings: [
        { name: "FMB Trucks", site: "Other Site", advancedSettings: { buzzerEnabled: true } },
        { name: "FMB Trucks", site: "Mmulu Company", advancedSettings: { buzzerEnabled: false } }
      ]
    };
    const db = {
      prepare: (sql: string) => {
        const table = /configuration_groups/.test(sql) ? "configuration_groups" : "bindings";
        const statement = {
          bind: () => statement,
          all: async () => ({ results: tables[table].map((row) => ({ data: JSON.stringify(row) })) })
        };
        return statement;
      }
    } as unknown as D1Database;
    const binding = await loadAssetDeviceBinding({ VIVI_D1: db }, "t1", { site: "Mmulu Company", configGroup: "Trucks" });
    expect(binding?.advancedSettings).toEqual({ buzzerEnabled: false });
  });
});

describe("alert SMS (Africa's Talking)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalises Ugandan and international numbers", () => {
    expect(normalizePhoneNumber("0772 123 456")).toBe("+256772123456");
    expect(normalizePhoneNumber("+254712345678")).toBe("+254712345678");
    expect(normalizePhoneNumber("00256772123456")).toBe("+256772123456");
    expect(normalizePhoneNumber("12")).toBe("");
  });

  it("builds a short message", () => {
    expect(
      buildAlertSmsText({ notificationName: "Over Speeding", assetLabel: "UA 432EC", eventTime: "22/10/2026 09:00", speedKph: 97.4 })
    ).toBe("VIVI alert: Over Speeding | UA 432EC | 22/10/2026 09:00 | 97 km/h");
  });

  it("sends once per event and number, and reports when it is not configured", async () => {
    const store = new Map<string, string>();
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) } as unknown as KVNamespace;
    expect(await sendAlertSmsOnce({ ViviTEL: kv }, { tenantId: "t", eventKey: "1", to: "0772123456", message: "x" })).toBe("not-configured");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ SMSMessageData: { Recipients: [{ status: "Success", statusCode: 101 }] } }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = { ViviTEL: kv, AFRICASTALKING_USERNAME: "vivi", AFRICASTALKING_API_KEY: "k" };
    expect(await sendAlertSmsOnce(env, { tenantId: "t", eventKey: "1", to: "0772123456", message: "x" })).toBe("sent");
    expect(await sendAlertSmsOnce(env, { tenantId: "t", eventKey: "1", to: "0772123456", message: "x" })).toBe("already-sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.africastalking.com/version1/messaging");
  });
});
