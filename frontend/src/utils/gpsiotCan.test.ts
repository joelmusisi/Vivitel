import assert from "node:assert/strict";
import test from "node:test";
import { deviceBindingHasCanAttached, readCanProtocolFromBinding } from "./gpsiotCan.ts";

test("device binding reports CAN attached only when C1/C2 has protocol", () => {
  assert.equal(deviceBindingHasCanAttached({ lines: [{ id: "c1", canEnabled: false }] }), false);
  assert.equal(deviceBindingHasCanAttached({ lines: [{ id: "c1", canEnabled: true, canProtocol: "" }] }), false);
  assert.equal(
    deviceBindingHasCanAttached({
      lines: [{ id: "c1", canEnabled: true, canProtocol: "Dynamic CAN (Scriptable CAN)" }]
    }),
    true
  );
  assert.equal(
    readCanProtocolFromBinding({
      lines: [
        { id: "c2", canEnabled: true, canProtocol: "Script.CAN.J1939.250KBPS.v1.18.0.0_MG (Scriptable CAN)" }
      ]
    }),
    "Script.CAN.J1939.250KBPS.v1.18.0.0_MG (Scriptable CAN)"
  );
});
