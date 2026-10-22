import { pick } from "./objectPath";
import { coerceBool, coerceNumber } from "./coercion";

export const buildLatestTelemetrySummary = (event: any, createdAt: string) => {
  const ignitionRaw = pick(event, [
    "data.data.ignition",
    "data.ignition",
    "ignition",
    "attributes.ignition",
    "decoded.ignition",
    "decoded.Ignition"
  ]);
  const ignition = coerceBool(ignitionRaw);

  const powerRaw = pick(event, [
    "data.data.power",
    "data.power",
    "power",
    "attributes.power",
    "data.data.externalPower",
    "data.externalPower",
    "attributes.externalPower",
    "data.data.voltage",
    "data.voltage",
    "attributes.voltage"
  ]);
  const powerVoltage = coerceNumber(powerRaw);

  const batteryRaw = pick(event, [
    "data.data.battery",
    "data.battery",
    "battery",
    "attributes.battery",
    "data.data.batteryVoltage",
    "data.batteryVoltage",
    "attributes.batteryVoltage"
  ]);
  const batteryVoltage = coerceNumber(batteryRaw);

  const satsRaw = pick(event, [
    "data.data.satellites",
    "data.data.sat",
    "data.satellites",
    "data.sat",
    "satellites",
    "sat",
    "attributes.satellites",
    "attributes.sat",
    "data.data.sats",
    "data.sats",
    "attributes.sats"
  ]);
  const satellites = coerceNumber(satsRaw);

  const chargingRaw = pick(event, [
    "data.data.charging",
    "data.charging",
    "charging",
    "attributes.charging",
    "data.data.charge",
    "data.charge",
    "attributes.charge"
  ]);
  let charging = coerceBool(chargingRaw);
  if (charging === null && powerVoltage !== null && batteryVoltage !== null) charging = powerVoltage > batteryVoltage + 0.3;

  const firmwareVersion = String(
    pick(event, [
      "data.data.firmware",
      "data.firmware",
      "firmware",
      "attributes.firmware",
      "data.data.fw",
      "data.fw",
      "attributes.fw",
      "device.firmware",
      "device.firmwareVersion"
    ])
      ?? ""
  ).trim();

  const lat = coerceNumber(pick(event, ["data.data.lat", "data.lat", "data.data.latitude", "data.latitude", "lat", "latitude"]));
  const lng = coerceNumber(
    pick(event, [
      "data.data.lon",
      "data.lon",
      "data.data.lng",
      "data.lng",
      "data.data.longitude",
      "data.longitude",
      "lon",
      "lng",
      "longitude"
    ])
  );
  const speed = coerceNumber(pick(event, ["data.data.speed", "data.speed", "speed", "attributes.speed", "position.speed"]));
  const heading = coerceNumber(pick(event, ["data.data.heading", "data.heading", "heading", "attributes.heading", "position.course", "position.heading"]));
  const motionRaw = pick(event, ["data.data.motion", "data.motion", "motion", "attributes.motion", "data.data.moving", "data.moving", "moving"]);
  const motion = coerceBool(motionRaw);
  const movement = (() => {
    if (speed !== null) {
      if (speed <= 1.2) return "stationary" as const;
      if (satellites !== null && satellites <= 3 && speed < 8) return "stationary" as const;
      if (ignition === false && speed < 8) return "stationary" as const;
      return "moving" as const;
    }
    if (motion === true) {
      if (satellites !== null && satellites <= 3) return "stationary" as const;
      if (ignition === false) return "stationary" as const;
      return "moving" as const;
    }
    if (motion === false) return "stationary" as const;
    if (ignition === false) return "stationary" as const;
    return "unknown" as const;
  })();

  return {
    at: createdAt,
    ignition: ignition === null ? undefined : ignition,
    powerVoltage: powerVoltage === null ? undefined : powerVoltage,
    satellites: satellites === null ? undefined : satellites,
    charging: charging === null ? undefined : charging,
    firmwareVersion: firmwareVersion || undefined,
    lat: lat === null ? undefined : lat,
    lng: lng === null ? undefined : lng,
    speed: speed === null ? undefined : speed,
    heading: heading === null ? undefined : heading,
    movement
  };
};
