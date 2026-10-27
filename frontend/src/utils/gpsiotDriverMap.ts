/**
 * Drivers page ↔ GPS IoT AttachedAsset driver API.
 *
 * | Drivers column           | Vivitel field      | GPS IoT field                         |
 * |--------------------------|--------------------|---------------------------------------|
 * | Driver name              | name               | VName                                 |
 * | Driver ID                | driverId           | DriverID / attachedAssetId            |
 * | Extended driver ID       | extendedDriverId   | DriverIDNo / TagNo (create)           |
 * | Employee number          | employeeNumber     | DriverPersonalID                      |
 * | Mobile number            | mobileNumber       | DriverContactNo                       |
 * | Driver type              | driverType         | DriverType (ibutton|RFID|NONE|Beacon) |
 * | Date of birth            | driverDob          | DriverDOB                             |
 * | Licence number           | licenceNo          | LicenceNo                             |
 * | Licence expiry           | licenseExpiryDate  | license_expiry_date                   |
 * | Time zone                | timeZone           | TimeZone                              |
 * | Country                  | country            | (Vivitel only)                        |
 * | Email                    | email              | (Vivitel only)                        |
 * | Site                     | site               | ClientID via site/database match      |
 * | Last trip                | lastTrip           | (not in driver API)                   |
 * | Time since last trip     | timeSinceLastTrip  | (not in driver API)                   |
 *
 * Create: POST /api/AttachedAsset/CreateDriver (no DriverID)
 * Update: POST /api/AttachedAsset/UpdateDriver (requires DriverID — never Create)
 * Delete: DELETE /api/AttachedAsset/DeleteDriver
 */

export const GPSIOT_DRIVER_COLUMN_MAP = {
  name: ["VName"],
  driverId: ["DriverID", "attachedAssetId"],
  extendedDriverId: ["DriverIDNo", "TagNo"],
  employeeNumber: ["DriverPersonalID"],
  mobileNumber: ["DriverContactNo"],
  driverType: ["DriverType"],
  driverDob: ["DriverDOB"],
  licenceNo: ["LicenceNo"],
  licenseExpiryDate: ["license_expiry_date"],
  timeZone: ["TimeZone"],
  country: [],
  email: [],
  site: ["ClientID"],
  lastTrip: [],
  timeSinceLastTrip: []
} as const;
