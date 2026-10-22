import assert from "node:assert/strict";
import test from "node:test";

/** Mirror of UK getTraccarGeofences enter/exit pairing used by Routes Dwell / Locations Not Visited. */
function pairGeofenceVisits(
  events: Array<{ type: string; eventTime: string; label: string }>
): Array<{ label: string; startTime: string; endTime: string }> {
  const isEnter = (type: string) =>
    /geofence\s*enter|enter(ed)?\s*(geofence|location)|location\s*entry/i.test(type)
    && !/exit|left|depart/i.test(type);
  const isExit = (type: string) =>
    /geofence\s*exit|exit(ed)?\s*(geofence|location)|location\s*exit/i.test(type);
  const open = new Map<string, string>();
  const visits: Array<{ label: string; startTime: string; endTime: string }> = [];
  for (const event of events) {
    const key = event.label.toLowerCase();
    if (isEnter(event.type)) {
      open.set(key, event.eventTime);
      continue;
    }
    if (isExit(event.type)) {
      const start = open.get(key) || event.eventTime;
      open.delete(key);
      visits.push({ label: event.label, startTime: start, endTime: event.eventTime });
    }
  }
  return visits;
}

test("geofence enter/exit events pair into dwell visits for reports", () => {
  const visits = pairGeofenceVisits([
    { type: "Geofence Entered", eventTime: "2026-01-01T10:00:00Z", label: "Depot" },
    { type: "Geofence Exited", eventTime: "2026-01-01T11:30:00Z", label: "Depot" },
    { type: "Location Entry", eventTime: "2026-01-01T12:00:00Z", label: "Yard" },
    { type: "Location Exit", eventTime: "2026-01-01T12:15:00Z", label: "Yard" }
  ]);
  assert.equal(visits.length, 2);
  assert.equal(visits[0]?.label, "Depot");
  assert.equal(visits[0]?.startTime, "2026-01-01T10:00:00Z");
  assert.equal(visits[0]?.endTime, "2026-01-01T11:30:00Z");
  assert.equal(visits[1]?.label, "Yard");
});
