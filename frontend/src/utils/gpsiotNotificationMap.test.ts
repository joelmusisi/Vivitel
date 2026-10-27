import assert from "node:assert/strict";
import test from "node:test";
import {
  formatGpsIotEventDescription,
  mapGpsIotNotificationAlertToTraccarEvent,
  mapGpsIotNotificationAlertToViviUserAlert,
  mapGpsIotTelemetryToTraccarEvent,
  mergeGpsIotEventsIntoNotificationLibrary,
  stampNotificationRowsWithGpsIotEventIds
} from "./gpsiotNotificationMap.ts";

test("mergeGpsIotEventsIntoNotificationLibrary updates eventId without duplicating descriptions", () => {
  const merged = mergeGpsIotEventsIntoNotificationLibrary(
    [
      { description: "Harsh Braking", type: "System", availability: "Available", eventId: "old" },
      { description: "Ignition On", type: "System", availability: "Unavailable" }
    ],
    [
      { id: "RGU2AQ==", eventName: "harsh braking" },
      { id: "RGU2Bg==", eventName: "ignition status on" },
      { id: "RGU2AA==", eventName: "overspeed - device speed limit" }
    ]
  );
  assert.equal(merged.items.filter((row) => /harsh braking/i.test(row.description)).length, 1);
  assert.equal(merged.items.find((row) => /harsh braking/i.test(row.description))?.eventId, "RGU2AQ==");
  assert.equal(merged.updated >= 1, true);
  assert.equal(merged.added >= 1, true);
  assert.equal(formatGpsIotEventDescription("harsh braking"), "Harsh Braking");
});

test("stampNotificationRowsWithGpsIotEventIds only updates matching rows", () => {
  const stamped = stampNotificationRowsWithGpsIotEventIds(
    [
      { description: "Harsh Acceleration", type: "System", availability: "Available" },
      { description: "Custom Local Event", type: "Custom", availability: "Available", eventId: "local-1" }
    ],
    [{ id: "RGU2Ag==", eventName: "harsh acceleration" }]
  );
  assert.equal(stamped[0]?.eventId, "RGU2Ag==");
  assert.equal(stamped[1]?.eventId, "local-1");
});

test("telemetry maps onto Traccar event attributes for notification parameters", () => {
  const event = mapGpsIotTelemetryToTraccarEvent(
    {
      eventName: "overspeed - device speed limit",
      location: "M1",
      latitude: 51.5,
      longitude: -0.1,
      odometer: 1000,
      battery: 90,
      speed: 120,
      roadSpeed: 70,
      date: "2026/01/18 08:10:17",
      attributes: { P: 12.4 }
    },
    1234,
    0
  );
  assert.equal(event.type, "overspeed - device speed limit");
  assert.equal(event.attributes.speed, 120);
  assert.equal(event.attributes.roadSpeed, 70);
  assert.equal(event.attributes.address, "M1");
  assert.equal(event.attributes.latitude, 51.5);
  assert.equal(event.attributes.longitude, -0.1);
  assert.equal(event.positionId, 0);
});

test("GetNotificationAlerts maps to site-stamped Vivitel alerts", () => {
  const alert = mapGpsIotNotificationAlertToViviUserAlert(
    {
      alertId: "a1",
      imei: "359633100000001",
      latitude: 51.5,
      longitude: -0.1,
      assetName: "Van 1",
      alertName: "Overspeed",
      priority: "3",
      eventName: "overspeed - device speed limit",
      location: "M1",
      gpsDateTime: "2025-07-26T11:50:30",
      speed: 110,
      roadSpeed: 70,
      ignition: true,
      eventId: "12",
      additionalEventInfo: "limit 70",
      isDismissed: false,
      userTimeDate: "2025-07-26T14:50:30"
    },
    { tenantId: "tenant-1", site: "Depot A" }
  );
  assert.equal(alert.site, "Depot A");
  assert.equal(alert.eventLabel, "overspeed - device speed limit");
  assert.equal(alert.assetLabel, "Van 1");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.speedKph, 110);
  assert.match(alert.id, /^gpsiot-alert:/);

  const asEvent = mapGpsIotNotificationAlertToTraccarEvent(
    {
      alertId: "a1",
      imei: "359633100000001",
      latitude: 51.5,
      longitude: -0.1,
      assetName: "Van 1",
      alertName: "Overspeed",
      priority: "3",
      eventName: "overspeed - device speed limit",
      location: "M1",
      gpsDateTime: "2025-07-26T11:50:30",
      speed: 110,
      roadSpeed: 70,
      ignition: true,
      eventId: "12",
      additionalEventInfo: "limit 70",
      isDismissed: false,
      userTimeDate: ""
    },
    42,
    0
  );
  assert.equal(asEvent.attributes.source, "gpsiot-alert");
  assert.equal(asEvent.attributes.speed, 110);
  assert.equal(asEvent.attributes.address, "M1");
});
