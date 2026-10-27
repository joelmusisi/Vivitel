import type { GpsIotSecrets } from "./secrets.ts";

/**
 * GPS IoT live / Data Forwarding Common JSON row → Vivitel Live Tracking.
 *
 * Upstream fields (GetDevicesCurrentData / GetResellerDevicesCurrentData / Format=5):
 * DeviceName, ImeiNumber, VehicleSpeed (kph), RoadSpeed, Odometer (km),
 * IsIgnitionOn, Heading, Lat, Lon, Location, EventName, GPSDateTime,
 * Battery (%), Altitude, SensorData (JSON analogs), WorkingHours,
 * Attributes (JSON: S=satellites, P=power volts).
 */

export type GpsIotLiveDevice = {
  id: string;
  name: string;
  imei: string;
  latitude: number;
  longitude: number;
  /** Vehicle speed in km/h (GPS IoT VehicleSpeed). */
  speed: number;
  /** Road speed limit / reported road speed in km/h. */
  roadSpeed: number;
  course: number;
  address: string;
  deviceTime: string;
  ignition: boolean;
  /** Last event / notification name from GPS IoT EventName. */
  eventName: string;
  /** Battery level percent. */
  batteryLevel: number;
  altitude: number;
  /** Odometer in metres (converted from GPS IoT km when needed). */
  odometerM: number;
  workingHours: number;
  satellites: number;
  /** External / main power voltage (volts). */
  powerVoltage: number;
  /** Parsed SensorData analogs (An1, An2, …) for fuel / diagnostics. */
  sensorData: Record<string, number>;
  /** Full attribute bag for Live Tracking / diagnostics (Traccar-compatible keys). */
  attributes: Record<string, unknown>;
};

export type GpsIotFuelRefill = {
  date: string;
  initialLevel: number;
  finalLevel: number;
  filled: number;
  location: string;
  latitude: number;
  longitude: number;
};

export type GpsIotFuelDrain = {
  date: string;
  initialLevel: number;
  finalLevel: number;
  drained: number;
  location: string;
  latitude: number;
  longitude: number;
};

export type GpsIotFuelSensor = {
  sensor: string;
  refills: GpsIotFuelRefill[];
  drains: GpsIotFuelDrain[];
  totalDistance: number;
  totalEngineHours: number;
  fuelConsumption: number;
  fuelUsed: number;
  totalDrains: number;
  totalRefills: number;
};

export type GpsIotFuelInfo = {
  sensors: GpsIotFuelSensor[];
  refills: GpsIotFuelRefill[];
  drains: GpsIotFuelDrain[];
  totalDistance: number;
  totalEngineHours: number;
  fuelConsumption: number;
  fuelUsed: number;
  totalDrains: number;
  totalRefills: number;
};

export type GpsIotFuelReading = {
  sensor: string;
  fuelLevel: number;
};

/** POST /api/Fuel/GetFuelTelemetry — litres; IMEI-scoped refill/drain events + sensor periods. */
export type GpsIotFuelTelemetryEvent = {
  location: string;
  eventName: string;
  date: string;
  isDrain: boolean;
};

export type GpsIotFuelSensorPeriod = {
  startDate: string;
  endDate: string;
  /** Litres at period start. */
  initial: number;
  /** Litres at period end. */
  final: number;
  sensorName: string;
};

export type GpsIotFuelTelemetryRow = {
  imei: string;
  events: GpsIotFuelTelemetryEvent[];
  sensorReadings: GpsIotFuelSensorPeriod[];
};

const asRecord = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown) => String(value ?? "").trim();

const isTruthyFlag = (value: unknown) => /^(true|1|yes|on)$/i.test(text(value));

/** Parse GPS IoT JSON blobs that may use curly/smart quotes. */
export function parseGpsIotJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  const source = text(raw);
  if (!source) return {};
  const normalized = source
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function readSensorNumbers(raw: unknown): Record<string, number> {
  const obj = parseGpsIotJsonObject(raw);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

function readAttributeBag(attrs: Record<string, unknown>): { satellites: number; powerVoltage: number } {
  const satellites = num(
    attrs.S ?? attrs.s ?? attrs.sat ?? attrs.satellites ?? attrs.Satellites
  );
  const powerVoltage = num(
    attrs.P ?? attrs.p ?? attrs.power ?? attrs.Power ?? attrs.voltage ?? attrs.Voltage
  );
  return { satellites, powerVoltage };
}

/** Odometer from GPS IoT is typically km; values ≥ 1000 without decimals may already be metres. */
export function gpsIotOdometerToMetres(raw: unknown): number {
  const value = num(raw);
  if (!(value > 0)) return 0;
  if (value >= 100000) return Math.round(value);
  return Math.round(value * 1000);
}

export function mapGpsIotLiveRecord(row: unknown): GpsIotLiveDevice | null {
  const record = asRecord(row);
  const imei = text(record.ImeiNumber ?? record.imei ?? record.IMEI);
  const latitude = num(record.Lat ?? record.lat ?? record.Latitude);
  const longitude = num(record.Lon ?? record.lon ?? record.lng ?? record.Longitude);
  if (!imei || (latitude === 0 && longitude === 0)) return null;

  const speedKph = num(record.VehicleSpeed ?? record.speed ?? record.Speed);
  const roadSpeed = num(record.RoadSpeed ?? record.roadSpeed);
  const course = num(record.Heading ?? record.course ?? record.Course);
  const address = text(record.Location ?? record.address ?? record.Address);
  const deviceTime = text(record.GPSDateTime ?? record.deviceTime ?? record.fixTime ?? record.DateTime);
  const ignition = isTruthyFlag(record.IsIgnitionOn ?? record.ignition ?? record.Ignition);
  const eventName = text(record.EventName ?? record.eventName ?? record.Event);
  const batteryLevel = num(record.Battery ?? record.battery ?? record.BatteryLevel ?? record.batteryLevel);
  const altitude = num(record.Altitude ?? record.altitude);
  const odometerM = gpsIotOdometerToMetres(record.Odometer ?? record.odometer);
  const workingHours = num(record.WorkingHours ?? record.workingHours);
  const sensorData = readSensorNumbers(record.SensorData ?? record.sensorData);
  const attrBag = parseGpsIotJsonObject(record.Attributes ?? record.attributes);
  const { satellites, powerVoltage } = readAttributeBag(attrBag);

  const attributes: Record<string, unknown> = {
    source: "gpsiot",
    ignition,
    motion: speedKph > 1,
    sat: satellites > 0 ? satellites : undefined,
    satellites: satellites > 0 ? satellites : undefined,
    power: powerVoltage > 0 ? powerVoltage : undefined,
    batteryLevel: batteryLevel > 0 ? batteryLevel : undefined,
    battery: batteryLevel > 0 ? batteryLevel : undefined,
    odometer: odometerM > 0 ? odometerM : undefined,
    totalDistance: odometerM > 0 ? odometerM : undefined,
    event: eventName || undefined,
    eventName: eventName || undefined,
    alarm: eventName && !/^position report$/i.test(eventName) ? eventName : undefined,
    roadSpeed: roadSpeed > 0 ? roadSpeed : undefined,
    workingHours: workingHours > 0 ? workingHours : undefined,
    hours: workingHours > 0 ? workingHours : undefined,
    address: address || undefined,
    locationName: address || undefined,
    ...Object.fromEntries(
      Object.entries(sensorData).flatMap(([key, value]) => {
        const lower = key.toLowerCase();
        return [
          [key, value],
          [lower, value],
          // Common binding aliases for analogue fuel inputs.
          ...(lower === "an1" ? [["io1", value], ["adc1", value]] : []),
          ...(lower === "an2" ? [["io2", value], ["adc2", value]] : [])
        ];
      })
    ),
    ...attrBag
  };

  // Drop undefined attribute values for cleaner payloads.
  for (const key of Object.keys(attributes)) {
    if (attributes[key] === undefined) delete attributes[key];
  }

  return {
    id: imei,
    name: text(record.DeviceName ?? record.name ?? imei) || imei,
    imei,
    latitude,
    longitude,
    speed: speedKph,
    roadSpeed,
    course,
    address,
    deviceTime,
    ignition,
    eventName,
    batteryLevel,
    altitude,
    odometerM,
    workingHours,
    satellites,
    powerVoltage,
    sensorData,
    attributes
  };
}

export function parseGpsIotLiveDevices(payload: unknown): GpsIotLiveDevice[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.Data)
    ? root.Data
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.Devices)
        ? root.Devices
        : Array.isArray(payload)
          ? payload
          : root.ImeiNumber || root.imei || root.Lat || root.lat
            ? [payload]
            : [];
  return rows.flatMap((row) => {
    const mapped = mapGpsIotLiveRecord(row);
    return mapped ? [mapped] : [];
  });
}

/** Shape consumed by Live Tracking snapshot builders / realtime hub. */
export function gpsIotLiveToTraccarLiveRow(device: GpsIotLiveDevice): {
  deviceId: number;
  imei: string;
  name: string;
  status: string;
  lastUpdate: string;
  position: {
    lat: number;
    lng: number;
    speed: number;
    heading: number;
    course: number;
    altitude: number;
    address: string | null;
    fixTime?: string;
    deviceTime?: string;
    attributes: Record<string, unknown>;
  };
} {
  let hash = 0;
  for (let i = 0; i < device.imei.length; i += 1) {
    hash = (hash * 33 + device.imei.charCodeAt(i)) % 900000000;
  }
  const deviceId = hash + 1000;
  return {
    deviceId,
    imei: device.imei,
    name: device.name,
    status: "online",
    lastUpdate: device.deviceTime || new Date().toISOString(),
    position: {
      lat: device.latitude,
      lng: device.longitude,
      // Traccar live positions store speed in knots.
      speed: Number.isFinite(device.speed) ? device.speed / 1.852 : 0,
      heading: device.course,
      course: device.course,
      altitude: device.altitude,
      address: device.address || null,
      fixTime: device.deviceTime || undefined,
      deviceTime: device.deviceTime || undefined,
      attributes: { ...device.attributes }
    }
  };
}

function parseFuelEventLocation(item: Record<string, unknown>): { location: string; latitude: number; longitude: number } {
  return {
    location: text(item.location ?? item.Location),
    latitude: num(item.lat ?? item.Lat ?? item.latitude),
    longitude: num(item.lon ?? item.Lon ?? item.lng ?? item.longitude)
  };
}

function parseFuelRefillEvent(event: unknown): GpsIotFuelRefill | null {
  const item = asRecord(event);
  const date = text(item.date ?? item.Date);
  if (!date) return null;
  const loc = parseFuelEventLocation(item);
  return {
    date,
    initialLevel: num(item.initial_level ?? item.initialLevel),
    finalLevel: num(item.final_level ?? item.finalLevel),
    filled: num(item.filled ?? item.Filled ?? item.volume),
    location: loc.location,
    latitude: loc.latitude,
    longitude: loc.longitude
  };
}

function parseFuelDrainEvent(event: unknown): GpsIotFuelDrain | null {
  const item = asRecord(event);
  const date = text(item.date ?? item.Date);
  if (!date) return null;
  const loc = parseFuelEventLocation(item);
  return {
    date,
    initialLevel: num(item.initial_level ?? item.initialLevel),
    finalLevel: num(item.final_level ?? item.finalLevel),
    drained: num(item.drained ?? item.Drained ?? item.volume),
    location: loc.location,
    latitude: loc.latitude,
    longitude: loc.longitude
  };
}

/** POST /api/fuel/AssetFuelInfo → sensors with refills, drains, and period totals. */
export function parseGpsIotFuelInfo(payload: unknown): GpsIotFuelInfo {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : Array.isArray(asRecord(payload).data)
        ? (asRecord(payload).data as unknown[])
        : [];

  const sensors: GpsIotFuelSensor[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const refills = (Array.isArray(record.refills) ? record.refills : [])
      .map(parseFuelRefillEvent)
      .filter((event): event is GpsIotFuelRefill => Boolean(event));
    const drains = (Array.isArray(record.drains) ? record.drains : [])
      .map(parseFuelDrainEvent)
      .filter((event): event is GpsIotFuelDrain => Boolean(event));
    sensors.push({
      sensor: text(record.sensor ?? record.Sensor),
      refills,
      drains,
      totalDistance: num(record.total_distance ?? record.totalDistance),
      totalEngineHours: num(record.total_engine_hours ?? record.totalEngineHours),
      fuelConsumption: num(record.fuel_consumption ?? record.fuelConsumption),
      fuelUsed: num(record.fuel_used ?? record.fuelUsed),
      totalDrains: num(record.total_drains ?? record.totalDrains) || drains.reduce((sum, event) => sum + event.drained, 0),
      totalRefills: num(record.total_refills ?? record.totalRefills) || refills.reduce((sum, event) => sum + event.filled, 0)
    });
  }

  const refills = sensors.flatMap((sensor) => sensor.refills);
  const drains = sensors.flatMap((sensor) => sensor.drains);
  const sum = (pick: (sensor: GpsIotFuelSensor) => number) =>
    sensors.reduce((total, sensor) => total + pick(sensor), 0);

  return {
    sensors,
    refills,
    drains,
    totalDistance: sum((sensor) => sensor.totalDistance),
    totalEngineHours: sum((sensor) => sensor.totalEngineHours),
    fuelConsumption: sensors.length === 1 ? sensors[0].fuelConsumption : sum((sensor) => sensor.fuelConsumption),
    fuelUsed: sum((sensor) => sensor.fuelUsed),
    totalDrains: sum((sensor) => sensor.totalDrains),
    totalRefills: sum((sensor) => sensor.totalRefills)
  };
}

export function parseGpsIotFuelRefills(payload: unknown): GpsIotFuelRefill[] {
  return parseGpsIotFuelInfo(payload).refills;
}

/** POST /api/fuel/AssetCurrentReading → current tank litres per sensor. */
export function parseGpsIotFuelReadings(payload: unknown): GpsIotFuelReading[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).Data)
      ? (asRecord(payload).Data as unknown[])
      : Array.isArray(asRecord(payload).data)
        ? (asRecord(payload).data as unknown[])
        : [];
  return rows.flatMap((row) => {
    const record = asRecord(row);
    const raw = record.fuel_level ?? record.fuelLevel ?? record.FuelLevel;
    if (raw === undefined || raw === null || text(raw) === "") return [];
    const fuelLevel = num(raw);
    return [{ sensor: text(record.sensor ?? record.Sensor), fuelLevel }];
  });
}

function parseFuelTelemetryEvent(event: unknown): GpsIotFuelTelemetryEvent | null {
  const item = asRecord(event);
  const date = text(item.date ?? item.Date ?? item.eventDate ?? item.EventDate);
  if (!date) return null;
  const eventName = text(item.event_name ?? item.eventName ?? item.EventName ?? item.name);
  const isDrain = item.is_drain === true
    || item.isDrain === true
    || isTruthyFlag(item.is_drain ?? item.isDrain)
    || /sudden decrease|drain|theft|drop/i.test(eventName);
  return {
    location: text(item.location ?? item.Location),
    eventName,
    date,
    isDrain
  };
}

function parseFuelSensorPeriod(row: unknown): GpsIotFuelSensorPeriod | null {
  const item = asRecord(row);
  const sensorName = text(item.sensor_name ?? item.sensorName ?? item.SensorName ?? item.sensor ?? item.Sensor);
  const initial = num(item.initial ?? item.Initial ?? item.initial_level ?? item.initialLevel);
  const final = num(item.final ?? item.Final ?? item.final_level ?? item.finalLevel);
  const startDate = text(item.start_date ?? item.startDate ?? item.StartDate);
  const endDate = text(item.end_date ?? item.endDate ?? item.EndDate);
  if (!sensorName && !startDate && !endDate && initial === 0 && final === 0) return null;
  return { startDate, endDate, initial, final, sensorName: sensorName || "Fuel sensor" };
}

/** POST /api/Fuel/GetFuelTelemetry — units are litres. */
export function parseGpsIotFuelTelemetry(payload: unknown): GpsIotFuelTelemetryRow[] {
  const root = asRecord(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.Data)
        ? root.Data
        : Array.isArray(root.result)
          ? root.result
          : [];

  return rows.flatMap((row) => {
    const record = asRecord(row);
    const imei = text(record.imei ?? record.Imei ?? record.ImeiNumber ?? record.IMEI);
    const events = (Array.isArray(record.events) ? record.events : Array.isArray(record.Events) ? record.Events : [])
      .map(parseFuelTelemetryEvent)
      .filter((event): event is GpsIotFuelTelemetryEvent => Boolean(event));
    const sensorReadings = (
      Array.isArray(record.sensor_readings)
        ? record.sensor_readings
        : Array.isArray(record.sensorReadings)
          ? record.sensorReadings
          : Array.isArray(record.SensorReadings)
            ? record.SensorReadings
            : []
    )
      .map(parseFuelSensorPeriod)
      .filter((reading): reading is GpsIotFuelSensorPeriod => Boolean(reading));
    if (!imei && !events.length && !sensorReadings.length) return [];
    return [{ imei, events, sensorReadings }];
  });
}

/** Map GetFuelTelemetry (litres) onto the AssetFuelInfo shape used by Live + Reports. */
export function fuelTelemetryToFuelInfo(row: GpsIotFuelTelemetryRow): GpsIotFuelInfo {
  const primary = row.sensorReadings[0];
  const refills: GpsIotFuelRefill[] = [];
  const drains: GpsIotFuelDrain[] = [];

  for (const event of row.events) {
    const location = [event.location, event.eventName].filter(Boolean).join(" · ");
    if (event.isDrain) {
      drains.push({
        date: event.date,
        initialLevel: primary?.initial ?? 0,
        finalLevel: primary?.final ?? 0,
        drained: 0,
        location,
        latitude: 0,
        longitude: 0
      });
    } else {
      refills.push({
        date: event.date,
        initialLevel: primary?.initial ?? 0,
        finalLevel: primary?.final ?? 0,
        filled: 0,
        location,
        latitude: 0,
        longitude: 0
      });
    }
  }

  // When events lack volumes, estimate net fill/use from sensor period (litres).
  if (primary && refills.length && refills.every((event) => event.filled === 0) && primary.final > primary.initial) {
    const delta = primary.final - primary.initial;
    const share = delta / refills.length;
    for (const event of refills) event.filled = share;
  }
  if (primary && drains.length && drains.every((event) => event.drained === 0) && primary.initial > primary.final) {
    const delta = primary.initial - primary.final;
    const share = delta / drains.length;
    for (const event of drains) event.drained = share;
  }

  const sensors: GpsIotFuelSensor[] = row.sensorReadings.map((reading) => {
    const netUp = Math.max(0, reading.final - reading.initial);
    const netDown = Math.max(0, reading.initial - reading.final);
    return {
      sensor: reading.sensorName,
      refills,
      drains,
      totalDistance: 0,
      totalEngineHours: 0,
      fuelConsumption: 0,
      fuelUsed: netDown,
      totalDrains: drains.reduce((sum, event) => sum + event.drained, 0) || netDown,
      totalRefills: refills.reduce((sum, event) => sum + event.filled, 0) || netUp
    };
  });

  if (!sensors.length) {
    sensors.push({
      sensor: "Fuel",
      refills,
      drains,
      totalDistance: 0,
      totalEngineHours: 0,
      fuelConsumption: 0,
      fuelUsed: 0,
      totalDrains: drains.reduce((sum, event) => sum + event.drained, 0),
      totalRefills: refills.reduce((sum, event) => sum + event.filled, 0)
    });
  }

  const sum = (pick: (sensor: GpsIotFuelSensor) => number) =>
    sensors.reduce((total, sensor) => total + pick(sensor), 0);

  return {
    sensors,
    refills,
    drains,
    totalDistance: 0,
    totalEngineHours: 0,
    fuelConsumption: 0,
    fuelUsed: sum((sensor) => sensor.fuelUsed),
    totalDrains: sum((sensor) => sensor.totalDrains),
    totalRefills: sum((sensor) => sensor.totalRefills)
  };
}

/** Prefer AssetFuelInfo volumes/totals; fill refill/drain gaps from GetFuelTelemetry. */
export function mergeGpsIotFuelInfo(
  primary: GpsIotFuelInfo | null | undefined,
  telemetry: GpsIotFuelInfo | null | undefined
): GpsIotFuelInfo {
  const base: GpsIotFuelInfo = primary ?? {
    sensors: [],
    refills: [],
    drains: [],
    totalDistance: 0,
    totalEngineHours: 0,
    fuelConsumption: 0,
    fuelUsed: 0,
    totalDrains: 0,
    totalRefills: 0
  };
  if (!telemetry) return base;
  const refills = base.refills.length ? base.refills : telemetry.refills;
  const drains = base.drains.length ? base.drains : telemetry.drains;
  const sensors = base.sensors.length
    ? base.sensors.map((sensor) => ({
        ...sensor,
        refills: sensor.refills.length ? sensor.refills : refills,
        drains: sensor.drains.length ? sensor.drains : drains
      }))
    : telemetry.sensors;
  return {
    sensors,
    refills,
    drains,
    totalDistance: base.totalDistance || telemetry.totalDistance,
    totalEngineHours: base.totalEngineHours || telemetry.totalEngineHours,
    fuelConsumption: base.fuelConsumption || telemetry.fuelConsumption,
    fuelUsed: base.fuelUsed || telemetry.fuelUsed,
    totalDrains: base.totalDrains || telemetry.totalDrains || drains.reduce((sum, event) => sum + event.drained, 0),
    totalRefills: base.totalRefills || telemetry.totalRefills || refills.reduce((sum, event) => sum + event.filled, 0)
  };
}

export async function fetchGpsIotFuelTelemetry(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { startDate?: string; endDate?: string; imeiArray?: Array<string | number> },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotFuelTelemetryRow[]> {
  const imeiArray = (Array.isArray(body.imeiArray) ? body.imeiArray : [])
    .map((value) => text(value))
    .filter(Boolean);
  const startDate = text(body.startDate);
  const endDate = text(body.endDate);
  if (!startDate || !endDate) throw new Error("start_date and end_date are required");
  const payloadBody = {
    start_date: startDate,
    end_date: endDate,
    imei_array: imeiArray
  };
  const paths = ["/api/Fuel/GetFuelTelemetry", "/api/fuel/GetFuelTelemetry"];
  let lastError = "GPS IoT GetFuelTelemetry failed";
  for (const path of paths) {
    const response = await fetchImpl(`${secrets.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payloadBody)
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return parseGpsIotFuelTelemetry(payload);
    lastError = text(asRecord(payload).message ?? asRecord(payload).Message)
      || `GPS IoT GetFuelTelemetry failed (${response.status})`;
    if (response.status !== 404) break;
  }
  throw new Error(lastError);
}

export async function fetchGpsIotLiveDevices(
  secrets: GpsIotSecrets,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotLiveDevice[]> {
  const response = await fetchImpl(`${secrets.baseUrl}/api/Asset/GetResellerDevicesCurrentData`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GPS IoT live positions failed (${response.status})`);
  return parseGpsIotLiveDevices(payload);
}

export async function fetchGpsIotFuelInfo(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { assetId?: string; startDate?: string; endDate?: string; timeZoneId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotFuelInfo> {
  const assetId = text(body.assetId);
  if (!assetId) throw new Error("assetId is required");
  const response = await fetchImpl(`${secrets.baseUrl}/api/fuel/AssetFuelInfo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      AssetId: assetId,
      startDate: text(body.startDate),
      endDate: text(body.endDate),
      TimeZoneID: text(body.timeZoneId) || "UTC"
    })
  });
  const payload = await response.json().catch(() => ([]));
  if (!response.ok) throw new Error(`GPS IoT fuel info failed (${response.status})`);
  return parseGpsIotFuelInfo(payload);
}

export async function fetchGpsIotFuelRefills(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { assetId?: string; startDate?: string; endDate?: string; timeZoneId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotFuelRefill[]> {
  return (await fetchGpsIotFuelInfo(secrets, accessToken, body, fetchImpl)).refills;
}

export async function fetchGpsIotCurrentFuelReading(
  secrets: GpsIotSecrets,
  accessToken: string,
  body: { assetId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<GpsIotFuelReading[]> {
  const assetId = text(body.assetId);
  if (!assetId) throw new Error("assetId is required");
  const response = await fetchImpl(`${secrets.baseUrl}/api/fuel/AssetCurrentReading`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ AssetId: assetId })
  });
  const payload = await response.json().catch(() => ([]));
  if (!response.ok) throw new Error(`GPS IoT current fuel reading failed (${response.status})`);
  return parseGpsIotFuelReadings(payload);
}
