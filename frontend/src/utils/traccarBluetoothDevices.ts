import { getTraccarDevices, type TraccarDevice } from "./api";

export type TraccarBluetoothDeviceOption = {
  id: string;
  name: string;
  uniqueId: string;
};

const BLUETOOTH_TEXT_RE =
  /\b(bluetooth|bluetooth\s*remote|ble\b|beacon|tracker\s*bt|trackerbt|lbt\d|abt\d)\b/i;

const VEHICLE_CATEGORIES = new Set([
  "default",
  "animal",
  "bicycle",
  "boat",
  "bus",
  "car",
  "camper",
  "crane",
  "helicopter",
  "motorcycle",
  "person",
  "plane",
  "ship",
  "tractor",
  "trailer",
  "train",
  "tram",
  "truck",
  "van",
  "scooter"
]);

/** True when a Traccar device represents a Bluetooth / BLE peripheral (not a vehicle tracker). */
export function isTraccarBluetoothDevice(device: TraccarDevice): boolean {
  const category = String(device.category ?? "").trim().toLowerCase();
  if (category === "bluetooth" || category === "ble" || category === "beacon") return true;
  if (category && VEHICLE_CATEGORIES.has(category)) return false;

  const name = String(device.name ?? "").trim();
  const model = String(device.model ?? "").trim();
  const contact = String(device.contact ?? "").trim();
  const uniqueId = String(device.uniqueId ?? device.identifier ?? "").trim();
  const hay = `${name} ${model} ${contact} ${uniqueId}`;
  if (BLUETOOTH_TEXT_RE.test(hay)) return true;

  const attrs = device.attributes;
  if (attrs && typeof attrs === "object") {
    const sensorType = String((attrs as Record<string, unknown>).sensorType ?? "").trim().toLowerCase();
    const viviType = String((attrs as Record<string, unknown>).viviDeviceType ?? "").trim().toLowerCase();
    if (sensorType === "bluetooth" || sensorType === "ble") return true;
    if (viviType === "bluetooth" || viviType === "ble") return true;
  }

  return false;
}

export function toBluetoothDeviceOption(device: TraccarDevice): TraccarBluetoothDeviceOption | null {
  const id = String(device.id ?? "").trim();
  if (!id) return null;
  const name = String(device.name ?? "").trim();
  const uniqueId = String(device.uniqueId ?? device.identifier ?? "").trim();
  const label = name || uniqueId || `Device ${id}`;
  return { id, name: label, uniqueId };
}

/** Load Bluetooth-only devices from Traccar (GET /devices, client-filtered). */
export async function getTraccarBluetoothDevices(): Promise<TraccarBluetoothDeviceOption[]> {
  const devices = await getTraccarDevices();
  const options = devices
    .filter(isTraccarBluetoothDevice)
    .map(toBluetoothDeviceOption)
    .filter((row): row is TraccarBluetoothDeviceOption => row != null);
  return options.sort((a, b) => a.name.localeCompare(b.name));
}
