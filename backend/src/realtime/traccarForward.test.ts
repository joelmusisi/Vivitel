import { describe, expect, it } from "vitest";
import { normalizeTraccarForwardPayload } from "./traccarForward";

const position = { id: 11, deviceId: 5, latitude: -6.8, longitude: 39.28, fixTime: "2026-10-22T08:00:00Z", attributes: { sat: 9 } };
const device = { id: 5, uniqueId: "356307042441013", name: "T 123 ABC" };

describe("Traccar forwarding payloads", () => {
  it("reads position forwarding (forward.json)", () => {
    const out = normalizeTraccarForwardPayload({ position, device });
    expect(out.devices).toEqual([device]);
    expect(out.positions).toHaveLength(1);
    expect(out.positions[0].uniqueId).toBe("356307042441013");
    expect(out.events).toEqual([]);
  });

  it("reads event forwarding (event.forward.url)", () => {
    const event = { id: 99, deviceId: 5, type: "deviceOverspeed", eventTime: "2026-10-22T08:00:01Z", positionId: 11 };
    const out = normalizeTraccarForwardPayload({ event, position, device });
    expect(out.events).toEqual([event]);
    expect(out.positions).toHaveLength(1);
  });

  it("still accepts bare positions, arrays and bare events", () => {
    expect(normalizeTraccarForwardPayload([position, position]).positions).toHaveLength(2);
    const bareEvent = { id: 1, deviceId: 5, type: "ignitionOn", eventTime: "2026-10-22T08:00:00Z" };
    expect(normalizeTraccarForwardPayload(bareEvent).events).toEqual([bareEvent]);
  });

  it("ignores rows without a device or coordinates", () => {
    const out = normalizeTraccarForwardPayload({ position: { deviceId: 5 }, device: { id: 0 } });
    expect(out).toEqual({ devices: [], positions: [], events: [] });
  });
});
