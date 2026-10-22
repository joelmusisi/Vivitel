import { describe, expect, it } from "vitest";
import {
  advanceRuleEpisode,
  evaluateCondition,
  evaluateLibraryRow,
  isServerEvaluatedLibraryRow,
  libraryRowDelayMs,
  nativeTraccarTypeForLibraryRow,
  resolveConditionValue
} from "./serverAlertRules";

const position = (speedKph: number, attributes: Record<string, unknown> = {}) => ({
  speed: speedKph / 1.852,
  latitude: 0.3,
  longitude: 32.5,
  attributes
});

const row = (conditions: Array<Record<string, string>>, extra: Record<string, unknown> = {}) => ({
  description: "Mulu Over Speeding",
  availability: "Available",
  parameters: { conditions, ...extra }
});

describe("condition values", () => {
  it("reads speed in km/h, attributes, and IO inputs", () => {
    expect(resolveConditionValue("Speed", position(90))).toBeCloseTo(90);
    expect(resolveConditionValue("Ignition", position(0, { ignition: true }))).toBe(true);
    expect(resolveConditionValue("IO3", position(0, { io3: 1 }))).toBe(1);
    expect(resolveConditionValue("Satellites", position(0, { sat: 7 }))).toBe(7);
    expect(resolveConditionValue("External Voltage", position(0, { External_Voltage: 11.2 }))).toBe(11.2);
  });

  it("compares numbers, booleans and text", () => {
    expect(evaluateCondition(90, ">", "80")).toBe(true);
    expect(evaluateCondition(true, "is", "true")).toBe(true);
    expect(evaluateCondition(0, "is", "true")).toBe(false);
    expect(evaluateCondition("Open", "is not", "closed")).toBe(true);
    expect(evaluateCondition(undefined, ">", "1")).toBeNull();
  });
});

describe("library rule evaluation", () => {
  it("applies AND before OR like the Traccar expression", () => {
    const rule = row([
      { field: "Speed", operator: ">", value: "80", join: "and" },
      { field: "Ignition", operator: "is", value: "true", join: "or" },
      { field: "IO3", operator: "is", value: "true" }
    ]);
    expect(evaluateLibraryRow(rule, position(90, { ignition: true }))).toBe(true);
    expect(evaluateLibraryRow(rule, position(90, { ignition: false }))).toBe(false);
    expect(evaluateLibraryRow(rule, position(10, { ignition: false, io3: true }))).toBe(true);
  });

  it("only evaluates custom, available rows with conditions", () => {
    expect(isServerEvaluatedLibraryRow(row([{ field: "Speed", operator: ">", value: "80" }]))).toBe(true);
    expect(isServerEvaluatedLibraryRow({ ...row([{ field: "Speed", operator: ">", value: "80" }]), availability: "Unavailable" })).toBe(false);
    expect(isServerEvaluatedLibraryRow({ description: "Ignition On", availability: "Available", parameters: { conditions: [{ field: "Ignition", operator: "is", value: "true" }] } })).toBe(false);
    expect(nativeTraccarTypeForLibraryRow({ description: "Geofence Entered" })).toBe("geofenceEnter");
  });

  it("reads the delay", () => {
    expect(libraryRowDelayMs(row([], { record: { delay: { hours: "0", minutes: "1", seconds: "30" } } }))).toBe(90_000);
  });
});

describe("firing", () => {
  it("fires once per episode after the delay and re-arms when the condition clears", () => {
    let state = undefined;
    const step = (matched: boolean, at: number) => {
      const next = advanceRuleEpisode(state, matched, at, 60_000);
      state = next.state;
      return next.fire;
    };
    expect(step(true, 0)).toBe(false);
    expect(step(true, 30_000)).toBe(false);
    expect(step(true, 60_000)).toBe(true);
    expect(step(true, 90_000)).toBe(false);
    expect(step(false, 120_000)).toBe(false);
    expect(step(true, 150_000)).toBe(false);
    expect(step(true, 210_000)).toBe(true);
  });

  it("ignores positions that arrive out of order", () => {
    const first = advanceRuleEpisode(undefined, true, 100_000, 0);
    expect(first.fire).toBe(true);
    expect(advanceRuleEpisode({ ...first.state, fired: false }, true, 50_000, 0).fire).toBe(false);
  });
});

describe("demo Over Speeding row (all settings filled in)", () => {
  // Same row the library editor saves: Speed > 80 AND Ignition is true, 30 s delay.
  const demo = {
    description: "Over Speeding",
    type: "Custom",
    availability: "Available",
    parameters: {
      conditions: [
        { field: "Speed", operator: ">", value: "80", join: "and" },
        { field: "Ignition", operator: "is", value: "true" }
      ],
      returnValue: { param: "No return value", mode: "None" },
      record: { event: true, delay: { hours: "0", minutes: "0", seconds: "30" }, recordingType: "Alert" },
      active: { enabled: true, userAlerts: { email: true, inApp: true, sms: false } }
    }
  };

  it("is evaluated by Vivitel, needs both conditions, and waits for the delay", () => {
    expect(isServerEvaluatedLibraryRow(demo)).toBe(true);
    expect(libraryRowDelayMs(demo)).toBe(30_000);
    expect(evaluateLibraryRow(demo, position(95, { ignition: false }))).toBe(false);
    expect(evaluateLibraryRow(demo, position(79, { ignition: true }))).toBe(false);
    expect(evaluateLibraryRow(demo, position(95, { ignition: true }))).toBe(true);

    let state;
    const fireAt = (second: number, speed: number) => {
      const step = advanceRuleEpisode(state, evaluateLibraryRow(demo, position(speed, { ignition: true })), second * 1000, 30_000);
      state = step.state;
      return step.fire;
    };
    expect(fireAt(0, 95)).toBe(false);
    expect(fireAt(20, 96)).toBe(false);
    expect(fireAt(35, 97)).toBe(true);
    expect(fireAt(60, 99)).toBe(false);
  });
});
