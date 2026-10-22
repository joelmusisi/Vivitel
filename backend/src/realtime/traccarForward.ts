/**
 * Traccar HTTP forwarding payloads (traccar.xml):
 *
 *   forward.url + forward.json=true        → { "position": {...}, "device": {...} }
 *   event.forward.url (always JSON)         → { "event": {...}, "position": {...}, "device": {...} }
 *
 * Older webhook setups post a bare Position, an array of them, or a bare Event.
 * Everything is normalised to devices / positions / events lists.
 */

type Row = Record<string, any>;

const isObject = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const looksLikePosition = (row: Row) =>
  Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) && Number(row.deviceId) > 0;

const looksLikeEvent = (row: Row) =>
  typeof row.type === "string" && Number(row.deviceId) > 0 && ("eventTime" in row || "positionId" in row);

export function normalizeTraccarForwardPayload(body: unknown): { devices: Row[]; positions: Row[]; events: Row[] } {
  const devices: Row[] = [];
  const positions: Row[] = [];
  const events: Row[] = [];
  const items = Array.isArray(body) ? body : [body];

  for (const item of items) {
    if (!isObject(item)) continue;
    const wrapped = isObject(item.position) || isObject(item.device) || isObject(item.event);
    if (wrapped) {
      const device = isObject(item.device) ? item.device : null;
      const position = isObject(item.position) ? { ...item.position } : null;
      const event = isObject(item.event) ? { ...item.event } : null;
      if (device && Number(device.id) > 0) devices.push(device);
      if (position && looksLikePosition(position)) {
        // forward.json carries the device next to the position; keep the IMEI on the row.
        if (device && !position.uniqueId) position.uniqueId = device.uniqueId;
        positions.push(position);
      }
      if (event && Number(event.deviceId) > 0) events.push(event);
      continue;
    }
    if (looksLikePosition(item)) positions.push(item);
    else if (looksLikeEvent(item)) events.push(item);
  }
  return { devices, positions, events };
}
