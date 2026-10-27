import { describe, expect, it } from "vitest";
import { isTraccarBluetoothDevice } from "./traccarBluetoothDevices";

describe("isTraccarBluetoothDevice", () => {
  it("detects explicit bluetooth category", () => {
    expect(isTraccarBluetoothDevice({ id: 1, category: "bluetooth", name: "Sensor A" })).toBe(true);
  });

  it("detects bluetooth in name", () => {
    expect(isTraccarBluetoothDevice({ id: 2, name: "Driver Bluetooth Remote" })).toBe(true);
  });

  it("excludes normal vehicles", () => {
    expect(isTraccarBluetoothDevice({ id: 3, category: "car", name: "Fleet truck 01" })).toBe(false);
  });
});
