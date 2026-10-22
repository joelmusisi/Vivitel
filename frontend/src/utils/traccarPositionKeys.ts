/**
 * Traccar Position attribute keys + top-level fields.
 * Mirrors org.traccar.model.Position (Apache-2.0).
 * Use these instead of ad-hoc string literals when reading/writing position data.
 */

/** Position.attributes keys (org.traccar.model.Position KEY_*). */
export const TraccarPositionAttr = {
  ORIGINAL: "raw",
  INDEX: "index",
  HDOP: "hdop",
  VDOP: "vdop",
  PDOP: "pdop",
  SATELLITES: "sat", // in use
  SATELLITES_VISIBLE: "satVisible",
  RSSI: "rssi",
  GPS: "gps",
  ROAMING: "roaming",
  EVENT: "event",
  ALARM: "alarm",
  STATUS: "status",
  ODOMETER: "odometer", // meters
  ODOMETER_SERVICE: "serviceOdometer", // meters
  ODOMETER_TRIP: "tripOdometer", // meters
  HOURS: "hours", // milliseconds
  STEPS: "steps",
  HEART_RATE: "heartRate",
  INPUT: "input",
  OUTPUT: "output",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  POWER: "power", // volts (often mV from devices)
  BATTERY: "battery", // volts
  BATTERY_LEVEL: "batteryLevel", // percentage
  FUEL: "fuel", // liters
  FUEL_USED: "fuelUsed", // liters
  FUEL_CONSUMPTION: "fuelConsumption", // liters/hour
  FUEL_LEVEL: "fuelLevel", // percentage
  VERSION_FW: "versionFw",
  VERSION_HW: "versionHw",
  TYPE: "type",
  IGNITION: "ignition",
  FLAGS: "flags",
  ANTENNA: "antenna",
  CHARGE: "charge",
  IP: "ip",
  ARCHIVE: "archive",
  DISTANCE: "distance", // meters
  TOTAL_DISTANCE: "totalDistance", // meters
  RPM: "rpm",
  VIN: "vin",
  APPROXIMATE: "approximate",
  THROTTLE: "throttle",
  MOTION: "motion",
  ARMED: "armed",
  GEOFENCE: "geofence",
  ACCELERATION: "acceleration",
  HUMIDITY: "humidity",
  DEVICE_TEMP: "deviceTemp", // celsius
  COOLANT_TEMP: "coolantTemp", // celsius
  ENGINE_LOAD: "engineLoad",
  ENGINE_TEMP: "engineTemp",
  OPERATOR: "operator",
  COMMAND: "command",
  BLOCKED: "blocked",
  LOCK: "lock",
  DOOR: "door",
  AXLE_WEIGHT: "axleWeight",
  G_SENSOR: "gSensor",
  ICCID: "iccid",
  PHONE: "phone",
  SPEED_LIMIT: "speedLimit",
  DRIVING_TIME: "drivingTime",
  DTCS: "dtcs",
  OBD_SPEED: "obdSpeed", // km/h
  OBD_ODOMETER: "obdOdometer", // meters
  RESULT: "result",
  DRIVER_UNIQUE_ID: "driverUniqueId",
  CARD: "card"
} as const;

/** Attribute key prefixes (temp1, adc1, io1, …). */
export const TraccarPositionPrefix = {
  TEMP: "temp",
  ADC: "adc",
  IO: "io",
  COUNT: "count",
  IN: "in",
  OUT: "out"
} as const;

/** Position.attributes alarm values (ALARM_*). */
export const TraccarPositionAlarm = {
  GENERAL: "general",
  SOS: "sos",
  VIBRATION: "vibration",
  MOVEMENT: "movement",
  LOW_SPEED: "lowspeed",
  OVERSPEED: "overspeed",
  FALL_DOWN: "fallDown",
  LOW_POWER: "lowPower",
  LOW_BATTERY: "lowBattery",
  FAULT: "fault",
  POWER_OFF: "powerOff",
  POWER_ON: "powerOn",
  DOOR: "door",
  LOCK: "lock",
  UNLOCK: "unlock",
  GEOFENCE: "geofence",
  GEOFENCE_ENTER: "geofenceEnter",
  GEOFENCE_EXIT: "geofenceExit",
  GPS_ANTENNA_CUT: "gpsAntennaCut",
  ACCIDENT: "accident",
  TOW: "tow",
  IDLE: "idle",
  HIGH_RPM: "highRpm",
  ACCELERATION: "hardAcceleration",
  BRAKING: "hardBraking",
  CORNERING: "hardCornering",
  LANE_CHANGE: "laneChange",
  FATIGUE_DRIVING: "fatigueDriving",
  POWER_CUT: "powerCut",
  POWER_RESTORED: "powerRestored",
  JAMMING: "jamming",
  TEMPERATURE: "temperature",
  PARKING: "parking",
  BONNET: "bonnet",
  FOOT_BRAKE: "footBrake",
  FUEL_LEAK: "fuelLeak",
  TAMPERING: "tampering",
  REMOVING: "removing"
} as const;

/** Common satellite attribute aliases; prefer KEY_SATELLITES (`sat`). */
export const TRACCAR_SATELLITE_ATTR_KEYS = [
  TraccarPositionAttr.SATELLITES,
  TraccarPositionAttr.SATELLITES_VISIBLE,
  "satellites",
  "sats",
  "satelliteCount",
  "gpsSatellites"
] as const;

/** Power / battery voltage attribute aliases; prefer KEY_POWER / KEY_BATTERY. */
export const TRACCAR_POWER_ATTR_KEYS = [
  TraccarPositionAttr.POWER,
  TraccarPositionAttr.BATTERY,
  TraccarPositionAttr.BATTERY_LEVEL,
  "externalPower",
  "powerVoltage",
  "voltage",
  "batteryVoltage"
] as const;

/** Fuel attribute aliases; prefer KEY_FUEL / KEY_FUEL_LEVEL. */
export const TRACCAR_FUEL_ATTR_KEYS = [
  TraccarPositionAttr.FUEL,
  TraccarPositionAttr.FUEL_LEVEL,
  TraccarPositionAttr.FUEL_USED,
  TraccarPositionAttr.FUEL_CONSUMPTION
] as const;

export function readTraccarAttr(
  attributes: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): unknown {
  if (!attributes || typeof attributes !== "object") return undefined;
  for (const key of keys) {
    if (key in attributes && attributes[key] != null && attributes[key] !== "") {
      return attributes[key];
    }
  }
  return undefined;
}

export function readTraccarAttrNumber(
  attributes: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): number | undefined {
  const raw = readTraccarAttr(attributes, keys);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readTraccarAttrBoolean(
  attributes: Record<string, unknown> | null | undefined,
  keys: readonly string[]
): boolean | undefined {
  const raw = readTraccarAttr(attributes, keys);
  if (typeof raw === "boolean") return raw;
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes" || text === "on") return true;
  if (text === "false" || text === "0" || text === "no" || text === "off") return false;
  return undefined;
}
