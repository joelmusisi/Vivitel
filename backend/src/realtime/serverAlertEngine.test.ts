import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn(async () => ({ dispatched: true, emailed: 1 }));
vi.mock("../shared/deviceAlertDispatch", () => ({ dispatchDeviceAlertEmailsForTraccarEvent: dispatch }));

const { ServerAlertEngine } = await import("./serverAlertEngine");
const { buildScopedKvKey } = await import("../shared/scopeIsolation");

const TENANT = "dealer:org:db";
const SITE = "Mmulu Company";
const IMEI = "356307042441013";

const kvWith = (entries: Record<string, string>) =>
  ({ get: async (key: string) => entries[key] ?? null, put: async () => undefined }) as unknown as KVNamespace;

const d1With = (tables: { assets: Array<Record<string, unknown>>; bindings: Array<Record<string, unknown>> }) =>
  ({
    prepare: (sql: string) => {
      const rows = /FROM assets/.test(sql)
        ? tables.assets.map((asset) => ({ tenantId: TENANT, data: JSON.stringify(asset) }))
        : tables.bindings.map((binding) => ({ data: JSON.stringify(binding) }));
      const statement = { all: async () => ({ results: rows }), bind: () => statement };
      return statement;
    }
  }) as unknown as D1Database;

const overSpeed = {
  description: "Mulu Over Speeding",
  availability: "Available",
  parameters: {
    conditions: [{ field: "Speed", operator: ">", value: "80" }],
    active: { enabled: true, userAlerts: { email: true, inApp: true } }
  }
};

const engineFor = (library: unknown[], bindings: Array<Record<string, unknown>>) =>
  new ServerAlertEngine(
    {
      ViviTEL: kvWith({
        [buildScopedKvKey("libraries:notification", TENANT, SITE)]: JSON.stringify({ items: library })
      }),
      VIVI_D1: d1With({ assets: [{ imei: IMEI, site: SITE, assetDescription: "SHACKMAN UA 432EC" }], bindings })
    },
    { routeStorage: false }
  );

const watching = [{ site: SITE, monitoredEvents: ["Mulu Over Speeding"], emailRecipients: [{ id: "u1", name: "Ops", email: "ops@example.com" }] }];

const at = (second: number, speedKph: number) => ({
  deviceId: 7,
  fixTime: new Date(Date.UTC(2026, 9, 22, 8, 0, second)).toISOString(),
  speed: speedKph / 1.852,
  attributes: {}
});

describe("server alert engine", () => {
  beforeEach(() => dispatch.mockClear());

  it("sends a custom alert once per episode when an alert on the site watches it", async () => {
    const engine = engineFor([overSpeed], watching);
    const device = { uniqueId: IMEI };
    await engine.onPosition(at(0, 60), device);
    await engine.onPosition(at(30, 95), device);
    await engine.onPosition(at(60, 100), device);
    await engine.onPosition(at(90, 40), device);
    await engine.onPosition(at(120, 90), device);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][1]).toMatchObject({
      tenantId: TENANT,
      serverRule: true,
      notificationName: "Mulu Over Speeding",
      traccarEvent: { deviceId: 7, attributes: { alarm: "Mulu Over Speeding", speedKph: 95 } }
    });
  });

  it("sends nothing when the row's active message is off", async () => {
    const silent = { ...overSpeed, parameters: { ...overSpeed.parameters, active: { enabled: false } } };
    const engine = engineFor([silent], watching);
    await engine.onPosition(at(0, 120), { uniqueId: IMEI });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when no alert with people added watches the rule", async () => {
    const engine = engineFor([overSpeed], [{ site: SITE, monitoredEvents: ["Mulu Over Speeding"] }]);
    await engine.onPosition(at(0, 120), { uniqueId: IMEI });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("leaves built-in events (ignition, geofence) to Traccar", async () => {
    const ignition = {
      description: "Ignition On",
      availability: "Available",
      parameters: { conditions: [{ field: "Ignition", operator: "is", value: "true" }] }
    };
    const engine = engineFor([ignition], [{ ...watching[0], monitoredEvents: ["Ignition On"] }]);
    await engine.onPosition({ ...at(0, 0), attributes: { ignition: true } }, { uniqueId: IMEI });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("cron runner", () => {
  beforeEach(() => dispatch.mockClear());

  it("keeps episode state between runs, fires once, and only writes when it changes", async () => {
    const { runServerAlertRules } = await import("./serverAlertEngine");
    const stored: Record<string, string> = {
      [buildScopedKvKey("libraries:notification", TENANT, SITE)]: JSON.stringify({ items: [overSpeed] })
    };
    let writes = 0;
    const env = {
      ViviTEL: {
        get: async (key: string) => stored[key] ?? null,
        put: async (key: string, value: string) => {
          writes += 1;
          stored[key] = value;
        }
      } as unknown as KVNamespace,
      VIVI_D1: d1With({ assets: [{ imei: IMEI, site: SITE }], bindings: watching })
    };
    const traccarAt = (second: number, speedKph: number) => async (path: string) =>
      path.startsWith("/api/devices")
        ? { ok: true, body: [{ id: 7, uniqueId: IMEI }] }
        : { ok: true, body: [at(second, speedKph)] };

    expect((await runServerAlertRules(env, traccarAt(0, 100))).fired).toBe(1);
    expect((await runServerAlertRules(env, traccarAt(120, 110))).fired).toBe(0);
    const writesAfterStillSpeeding = writes;
    expect((await runServerAlertRules(env, traccarAt(120, 110))).fired).toBe(0);
    expect(writes).toBe(writesAfterStillSpeeding);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
