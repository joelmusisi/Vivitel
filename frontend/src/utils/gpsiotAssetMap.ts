/**
 * Vivitel Assets page ↔ GPS IoT API field map (UK).
 *
 * | Assets column / form        | Vivitel field   | GPS IoT source                         |
 * |----------------------------|-----------------|----------------------------------------|
 * | Asset Description          | assetDescription| Asset.Name / vname                     |
 * | ISP Serial Number / Fleet  | fleetNumber    | Sim.SimSerial                          |
 * | Info Issued                | infoIssued      | (not in API)                           |
 * | IMEI                       | imei            | Device.ImeiNumber / live.ImeiNumber    |
 * | Site                       | site            | Vivitel site (not GPS IoT)             |
 * | Model                      | model           | Asset.Model                            |
 * | Last Position              | lastPosition    | live.GPSDateTime                       |
 * | Last Trip                  | lastTrip        | live.EventName                         |
 * | Registration Number        | registration    | registration_plate / asset_reg_number  |
 * | Asset ID                   | assetId         | Asset.AssetId                          |
 * | Country                    | country         | Vivitel / client region                |
 * | Asset Type                 | assetType       | asset_type / AssetTypeId               |
 * | Make                       | make            | Asset.Make                             |
 * | Year                       | year            | Asset.year                             |
 * | VIN Number                 | vin             | Asset.vin                              |
 * | Mobile Device              | mobileDevice    | Device.Description / DeviceTypeId      |
 * | Odometer                   | odometer        | live.Odometer                          |
 * | Engine Hours               | engineHours     | live.WorkingHours                      |
 * | Status                     | status          | Asset.Status                           |
 * | Last Location              | lastLocation    | live.Location                          |
 * | Config Upload Date         | configUploadDate| (not in API)                           |
 * | Configuration Group        | configGroup     | Asset.Groups[].Group                   |
 * | IMSI                       | imsi            | Sim.SimDesc only if IMSI-shaped        |
 * | MSISDN                     | msisdn          | Sim.GsmNo (fallback Device.GsmNumber)  |
 * | Faults                     | faults          | live.EventName                         |
 *
 * SIM lifecycle (no duplicates):
 * - ISP/Fleet → CreateSimcard/UpdateSimcard.SimSerial
 * - MSISDN → CreateSimcard/UpdateSimcard.GsmNo
 * - AssignSimCard(DeviceId, SimCardId) links SIM → device → asset
 * - List join: Device.SimCardId / Device.GsmNumber → Sim row
 *
 * Extra form fields:
 * - Colour → Asset.Colour
 * - Engine number → engine_no
 * - Fuel type → fuel_type / asset_fuel_type
 * - Target fuel → fuel_consumption
 * - Fuel tank capacity → tank_capacity
 * - Serial number → Device.SerialNumber
 * - Net provider → Sim.NetProvider
 */

export const GPSIOT_ASSET_COLUMN_MAP = {
  assetDescription: ["Name", "vname", "VName"],
  fleetNumber: ["SimSerial"],
  imei: ["ImeiNumber", "Imei"],
  model: ["Model"],
  lastPosition: ["GPSDateTime", "LastGpsDateTime"],
  lastTrip: ["EventName"],
  registration: ["registration_plate", "asset_reg_number"],
  assetId: ["AssetId"],
  assetType: ["asset_type", "AssetTypeId"],
  make: ["Make"],
  year: ["year"],
  vin: ["vin"],
  mobileDevice: ["Description", "DeviceTypeId"],
  odometer: ["Odometer"],
  engineHours: ["WorkingHours"],
  status: ["Status"],
  lastLocation: ["Location"],
  configGroup: ["Groups.Group"],
  imsi: ["SimDesc"],
  msisdn: ["GsmNo", "GsmNumber"],
  faults: ["EventName"],
  colour: ["Colour", "Color"],
  engineNumber: ["engine_no"],
  fuelType: ["fuel_type", "asset_fuel_type"],
  targetFuel: ["fuel_consumption"],
  fuelTankCapacity: ["tank_capacity"],
  serialNumber: ["SerialNumber"],
  netProvider: ["NetProvider"]
} as const;
