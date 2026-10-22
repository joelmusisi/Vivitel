import assert from "node:assert/strict";
import test from "node:test";
import {
  createGpsIotAsset,
  getGpsIotAssetByCustomId,
  getGpsIotAssetByName,
  mapGpsIotPartsToAsset,
  mergeGpsIotFleetRows,
  normalizeCreateAssetInput,
  parseGpsIotAssets,
  resolveGpsIotAssetId,
  saveGpsIotAssetDetails
} from "./assets.ts";
import { decommissionGpsIotDevice, saveGpsIotDevice } from "./devices.ts";
import { resolveGpsIotDriverId, saveGpsIotDriver } from "./drivers.ts";
import { saveGpsIotSimcard } from "./sims.ts";
import { companyKey, emptyGpsIotClientProfile, matchClientsToSites, parseGpsIotClients, sitesFromHierarchy } from "./clients.ts";
import { parseGpsIotFuelInfo, parseGpsIotFuelReadings, parseGpsIotFuelRefills, parseGpsIotFuelTelemetry, parseGpsIotLiveDevices, fuelTelemetryToFuelInfo, mergeGpsIotFuelInfo } from "./fleet.ts";
import { parseGpsIotCanBus, parseGpsIotCanBusNumber } from "./canbus.ts";
import {
  findGpsIotAssetInputStatus,
  parseGpsIotClientAssetsInputStatus
} from "./inputStatus.ts";
import {
  matchGpsIotEventToDescription,
  parseGpsIotEventCatalog,
  parseGpsIotEventTelemetry,
  parseGpsIotNotificationAlerts
} from "./events.ts";
import {
  gpsIotShapeToArea,
  parseGpsIotGeofenceRows,
  saveGpsIotGeofence
} from "./geofences.ts";
import { handleGpsIotRequest } from "./handleRequest.ts";
import { readGpsIotSecrets, readZaGpsIotSecrets } from "./secrets.ts";
import { ensureSiteGpsIotClient } from "./siteClient.ts";
import { requestGpsIotToken, resetGpsIotTokenCache } from "./token.ts";
import {
  GPS_IOT_TRIPS_MAX_RANGE_MS,
  parseGpsIotClientMileage,
  parseGpsIotDailySummary,
  parseGpsIotMileageTrips,
  parseGpsIotTripDetails,
  resetGpsIotTripFetchCache,
  splitGpsIotRange,
  toGpsIotDateTime,
  toGpsIotTripDateTime,
  tripsToRoutePoints
} from "./trips.ts";

test("GPS IoT keys are refused outside the United Kingdom host", () => {
  const env = new Proxy(
    { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    {
      get(target, prop, receiver) {
        if (prop === "GPSIOT_WEB_API_KEY" || prop === "GPSIOT_WEB_SECRET_KEY" || prop === "GPSIOT_BASE_URL") {
          throw new Error(`secret read on non-UK region: ${String(prop)}`);
        }
        return Reflect.get(target, prop, receiver);
      }
    }
  );
  assert.equal(readGpsIotSecrets("us", env), null);
  assert.equal(readGpsIotSecrets("za", env), null);
  assert.equal(readGpsIotSecrets("", env), null);
});

test("GPS IoT keys are read only for the United Kingdom host", () => {
  const secrets = readGpsIotSecrets("uk", {
    GPSIOT_WEB_API_KEY: " web-key ",
    GPSIOT_WEB_SECRET_KEY: " web-secret "
  });
  assert.equal(secrets?.baseUrl, "https://api.gpsiot.net");
  assert.equal(secrets?.webApiKey, "web-key");
  assert.equal(secrets?.webSecretKey, "web-secret");
  assert.equal(readGpsIotSecrets("uk", { GPSIOT_WEB_API_KEY: "web-key" }), null);
  assert.equal(readZaGpsIotSecrets("uk", { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" }), null);
  assert.equal(readZaGpsIotSecrets("za", { GPSIOT_WEB_API_KEY: " web-key ", GPSIOT_WEB_SECRET_KEY: " web-secret " })?.webApiKey, "web-key");
});

test("token request posts the UK web key as username and the secret as password", async () => {
  resetGpsIotTokenCache();
  let seenUrl = "";
  let seenBody = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ access_token: "abc", token_type: "bearer", expires_in: 7200 }), { status: 200 });
  };
  const token = await requestGpsIotToken(
    { baseUrl: "https://api.gpsiot.net", webApiKey: "web-key", webSecretKey: "web-secret" },
    fetchImpl
  );
  assert.equal(seenUrl, "https://api.gpsiot.net/token");
  assert.equal(seenBody, "username=web-key&password=web-secret&grant_type=password");
  assert.equal(token.accessToken, "abc");
});

test("vCompanyName matches the site name", () => {
  const sites = sitesFromHierarchy({
    dealers: [
      {
        name: "UK Dealer",
        organisations: [
          {
            name: "Fleet Org",
            databases: [
              {
                id: "db-1",
                name: "North Database",
                sites: [
                  { id: "site-1", name: "demo client" },
                  { id: "site-2", name: "Demo Test" }
                ]
              }
            ]
          }
        ]
      }
    ]
  });
  const clients = parseGpsIotClients({
    client: [
      { ClientId: "c-1", vCompanyName: "demo client" },
      { ClientId: "", vCompanyName: "demo client 1" },
      { ClientId: "c-3", vCompanyName: "Demo Test" }
    ]
  });
  const mapped = matchClientsToSites(clients, sites);
  assert.equal(companyKey(" Demo   Client "), "demo client");
  assert.equal(mapped.sites[0]?.matched, true);
  assert.equal(mapped.sites[0]?.clientId, "c-1");
  assert.equal(mapped.sites[0]?.dealerName, "UK Dealer");
  assert.equal(mapped.sites[0]?.databaseName, "North Database");
  assert.equal(mapped.sites[1]?.matched, true);
  assert.equal(mapped.sites[1]?.clientId, "c-3");
  assert.deepEqual(mapped.unmatchedClients.map((row) => row.vCompanyName), ["demo client 1"]);
});

test("two GPS IoT clients with the same company name stay unmatched", () => {
  const mapped = matchClientsToSites(
    [
      { clientId: "a", vCompanyName: "North Fleet" },
      { clientId: "b", vCompanyName: "North Fleet" }
    ],
    [{ id: "site-1", name: "North Fleet", dealerName: "Dealer", organisationName: "Org", databaseId: "db-1", databaseName: "Fleet" }]
  );
  assert.equal(mapped.sites[0]?.ambiguous, true);
  assert.equal(mapped.sites[0]?.matched, false);
  assert.equal(mapped.sites[0]?.clientId, "");
  assert.equal(mapped.unmatchedClients.length, 2);
});

test("two sites with the same name stay unmatched", () => {
  const mapped = matchClientsToSites(
    [{ clientId: "a", vCompanyName: "Demo Test" }],
    [
      { id: "site-1", name: "Demo Test", dealerName: "Dealer", organisationName: "Org", databaseId: "db-1", databaseName: "Fleet" },
      { id: "site-2", name: "demo test", dealerName: "Dealer", organisationName: "Org", databaseId: "db-2", databaseName: "Other" }
    ]
  );
  assert.equal(mapped.sites[0]?.ambiguous, true);
  assert.equal(mapped.sites[1]?.matched, false);
  assert.equal(mapped.unmatchedClients.length, 1);
});

test("live positions and fuel refills map onto the UK fleet shape", () => {
  const devices = parseGpsIotLiveDevices({
    Data: [{ DeviceName: "Van 1", ImeiNumber: "111", Lat: "51.5", Lon: "-0.12", VehicleSpeed: 40, Heading: 90, Location: "London", GPSDateTime: "2026-09-25T10:00:00", IsIgnitionOn: "True" }]
  });
  assert.equal(devices[0]?.name, "Van 1");
  assert.equal(devices[0]?.latitude, 51.5);
  const refills = parseGpsIotFuelRefills([{ refills: [{ date: "2026-09-25 08:00:00", initial_level: 20, final_level: 60, filled: 40, location: "Depot", lat: 51.5, lon: -0.1 }] }]);
  assert.equal(refills[0]?.filled, 40);
  assert.equal(refills[0]?.location, "Depot");
});

test("AssetFuelInfo maps refills, drains, and period totals", () => {
  const info = parseGpsIotFuelInfo([{
    sensor: "Tank1",
    refills: [{ date: "2026-09-25 08:00:00", initial_level: 20, final_level: 60, filled: 40, location: "Depot", lat: 51.5, lon: -0.1 }],
    drains: [{ date: "2026-09-25 12:00:00", initial_level: 60, final_level: 50, drained: 10, location: "Yard", lat: 51.51, lon: -0.11 }],
    total_distance: 120.5,
    total_engine_hours: 4.2,
    fuel_consumption: 0.35,
    fuel_used: 42,
    total_drains: 10,
    total_refills: 40
  }]);
  assert.equal(info.refills.length, 1);
  assert.equal(info.drains.length, 1);
  assert.equal(info.drains[0]?.drained, 10);
  assert.equal(info.fuelUsed, 42);
  assert.equal(info.totalDistance, 120.5);
  assert.equal(info.totalEngineHours, 4.2);
  const readings = parseGpsIotFuelReadings([{ sensor: "Tank1", fuel_level: 55.5 }]);
  assert.equal(readings[0]?.fuelLevel, 55.5);
});

test("GetFuelTelemetry maps litre events and sensor periods (not the same as AssetFuelInfo)", () => {
  const rows = parseGpsIotFuelTelemetry({
    ok: true,
    data: [{
      imei: 111111111111,
      events: [
        {
          location: "location 1",
          event_name: "Sudden decrease of sensor detected",
          date: "2024-03-25T08:20:10",
          is_drain: true
        },
        {
          location: "location 2",
          event_name: "Sudden increase of sensor detected",
          date: "2024-03-25T09:20:10",
          is_drain: false
        }
      ],
      sensor_readings: [
        {
          start_date: "2024-03-25T00:20:31",
          end_date: "2024-03-25T23:59:40",
          initial: 61.0,
          final: 392.0,
          sensor_name: "Fuel sensor 1"
        },
        {
          start_date: "2024-03-25T00:20:31",
          end_date: "2024-03-25T23:59:40",
          initial: 61.0,
          final: 392.0,
          sensor_name: "Fuel sensor 2"
        }
      ]
    }]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.imei, "111111111111");
  assert.equal(rows[0]?.events[0]?.isDrain, true);
  assert.equal(rows[0]?.events[1]?.isDrain, false);
  assert.equal(rows[0]?.sensorReadings[0]?.initial, 61);
  assert.equal(rows[0]?.sensorReadings[0]?.final, 392);

  const mapped = fuelTelemetryToFuelInfo(rows[0]!);
  assert.equal(mapped.drains.length, 1);
  assert.equal(mapped.refills.length, 1);
  assert.equal(mapped.refills[0]?.location.includes("Sudden increase"), true);
  assert.equal(mapped.sensors.length, 2);
  // Net rise 61 → 392 litres shared across refill events when volumes are absent.
  assert.equal(mapped.refills[0]?.filled > 0, true);

  const merged = mergeGpsIotFuelInfo({
    sensors: [],
    refills: [{ date: "2024-03-25T09:20:10", initialLevel: 50, finalLevel: 100, filled: 50, location: "Depot", latitude: 0, longitude: 0 }],
    drains: [],
    totalDistance: 12,
    totalEngineHours: 1,
    fuelConsumption: 0.2,
    fuelUsed: 5,
    totalDrains: 0,
    totalRefills: 50
  }, mapped);
  assert.equal(merged.refills[0]?.filled, 50);
  assert.equal(merged.drains.length, 1);
  assert.equal(merged.totalDistance, 12);
  assert.equal(merged.fuelUsed, 5);
});

test("GetCanBus maps RPM / fuel / speed onto live attributes", () => {
  assert.equal(parseGpsIotCanBusNumber("69 L").value, 69);
  assert.equal(parseGpsIotCanBusNumber("13&deg C").value, 13);
  const status = parseGpsIotCanBus({
    RPM: "0 rpm",
    CTemp: "13&deg C",
    FuelL: "69 L",
    EngFuelRate: "988.7 l/h",
    EngLoad: "0 %",
    FuelPerc: "40 %",
    Vehiclespeed: "52 km/h",
    ObdOdometer: "125192000"
  }, "asset-1");
  assert.equal(status.assetId, "asset-1");
  assert.equal(status.attributes.rpm, 0);
  assert.equal(status.attributes.fuel, 69);
  assert.equal(status.attributes.canSpeed, 52);
  assert.equal(status.attributes.obdOdometer, 125192000);
  assert.equal(status.fields.FuelL, "69 L");
});

test("GetClientAssetsStatus maps digital / analogue inputs for diagnostics", () => {
  const rows = parseGpsIotClientAssetsInputStatus({
    success: true,
    data: [
      {
        AssetId: "asset-42",
        AssetName: "Van 1",
        Imei: "359633100000001",
        Registration: "AB12 CDE",
        Inputs: [
          { Name: "Input 1", Status: "High", Value: 1 },
          { Name: "DIN 2", Status: "Low", Value: 0 },
          { Name: "AIN 1", Value: "2830" }
        ],
        IO3: 1
      },
      {
        AssetId: "asset-99",
        AssetName: "Other",
        Imei: "359633100000099",
        digitalInputs: { "Input 1": "Low" }
      }
    ]
  });
  assert.equal(rows.length, 2);
  const matched = findGpsIotAssetInputStatus(rows, { assetId: "asset-42" });
  assert.ok(matched);
  assert.equal(matched?.registration, "AB12 CDE");
  assert.equal(matched?.inputs.some((row) => /input 1/i.test(row.name) && row.status === "High"), true);
  assert.equal(matched?.inputs.some((row) => /ain 1/i.test(row.name)), true);
  assert.equal(matched?.attributes["input.input_1"], 1);
  assert.equal(matched?.attributes.io3, 1);
  assert.equal(findGpsIotAssetInputStatus(rows, { imei: "359633100000099" })?.inputs[0]?.status, "Low");
});

test("GetEvents / GetTelemetry / GetNotificationAlerts map onto notification parameters", () => {
  const catalog = parseGpsIotEventCatalog({
    success: true,
    data: [
      { id: "RGU2AA==", event_name: "overspeed - device speed limit" },
      { id: "RGU2AQ==", event_name: "harsh braking" },
      { id: "RGU2AQ==", event_name: "harsh braking" }
    ]
  });
  assert.equal(catalog.length, 2);
  assert.equal(matchGpsIotEventToDescription(catalog, "Harsh Braking")?.id, "RGU2AQ==");

  const telemetry = parseGpsIotEventTelemetry({
    success: true,
    data: [{
      event_name: "Last Known Location",
      location: "Depot",
      latitude: "-34.078145",
      lon: "18.5",
      odometer: 170405.385,
      battery: 100,
      attributes: "{\"P\":12.4,\"Power\":\"12.4\",\"RSSI\":60}",
      speed: 0,
      date: "2026/01/18 08:10:17",
      road_speed: "60"
    }]
  });
  assert.equal(telemetry[0]?.eventName, "Last Known Location");
  assert.equal(telemetry[0]?.attributes.P, 12.4);
  assert.equal(telemetry[0]?.roadSpeed, 60);

  const alerts = parseGpsIotNotificationAlerts([{
    AlertId: "a1",
    ImeiNumber: 123,
    Latitude: 51.5,
    Longitude: -0.1,
    AssetName: "Van 1",
    AlertName: "Overspeed",
    Priority: "3",
    EventName: "overspeed - device speed limit",
    Location: "M1",
    GpsDateTime: "2025-07-26T11:50:30",
    Speed: 110,
    RoadSpeed: 70,
    IgnitionStatus: true,
    EventId: 12,
    additionalEventInfo: "limit 70",
    IsDismissed: false,
    UserTimeDate: "2025-07-26T14:50:30"
  }]);
  assert.equal(alerts[0]?.eventName, "overspeed - device speed limit");
  assert.equal(alerts[0]?.attributes.speed, 110);
  assert.equal(alerts[0]?.attributes.ignition, true);
});

test("client listing is refused when the request is not on the United Kingdom host", async () => {
  let called = false;
  const result = await handleGpsIotRequest({
    region: "us",
    method: "GET",
    pathname: "/gpsiot/databases",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    fetchImpl: async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }
  });
  assert.equal(result.status, 404);
  assert.equal(called, false);
});

test("CreateAsset / GetByCustomID / GetByName parse and call the documented GPS IoT paths", async () => {
  const assets = parseGpsIotAssets({
    Asset: [{ AssetId: "a-1", Name: "Van 1", Colour: "White", Make: "Ford", Model: "Transit", TrackerType: "Teltonika", Status: true, CustomId: "CUST-1" }]
  });
  assert.equal(assets[0]?.assetId, "a-1");
  assert.equal(assets[0]?.customId, "CUST-1");
  assert.equal(assets[0]?.status, true);

  const input = normalizeCreateAssetInput({
    ClientID: "c-1",
    VName: "Van 1",
    Make: "Ford",
    Color: "White",
    Model: "Transit",
    AssetTypeId: 3,
    CustomId: "CUST-1"
  });
  assert.equal(input.clientId, "c-1");
  assert.equal(input.assetTypeId, 3);

  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "web-key", webSecretKey: "web-secret" };
  let createUrl = "";
  let createBody = "";
  await createGpsIotAsset(secrets, "token", input, async (url, init) => {
    createUrl = String(url);
    createBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ Message: "Asset Created Successfully!" }), { status: 200 });
  });
  assert.equal(createUrl, "https://api.gpsiot.net/api/Asset/CreateAsset");
  assert.match(createBody, /"ClientID":"c-1"/);
  assert.match(createBody, /"VName":"Van 1"/);
  assert.match(createBody, /"AssetTypeId":3/);

  let byCustomUrl = "";
  const byCustom = await getGpsIotAssetByCustomId(secrets, "token", "CUST-1", async (url) => {
    byCustomUrl = String(url);
    return new Response(JSON.stringify({ Asset: [{ AssetId: "a-1", Name: "Van 1", Colour: "", Make: "", Model: "", TrackerType: "", Status: true, CustomId: "CUST-1" }] }), { status: 200 });
  });
  assert.equal(byCustomUrl, "https://api.gpsiot.net/api/Asset/GetAssetByCustomID");
  assert.equal(byCustom[0]?.name, "Van 1");

  let byNameUrl = "";
  const byName = await getGpsIotAssetByName(secrets, "token", "Van 1", async (url) => {
    byNameUrl = String(url);
    return new Response(JSON.stringify({ Asset: [{ AssetId: "a-1", Name: "Van 1", Colour: "", Make: "", Model: "", TrackerType: "", Status: true, CustomId: "CUST-1" }] }), { status: 200 });
  });
  assert.equal(byNameUrl, "https://api.gpsiot.net/api/Asset/GetAssetByName");
  assert.equal(byName[0]?.assetId, "a-1");
});

test("Assets page columns map ISP/Fleet to SimSerial and the rest to GPS IoT fields", () => {
  const mapped = mapGpsIotPartsToAsset({
    asset: {
      AssetId: "100",
      Name: "Van 1",
      Make: "Ford",
      Model: "Transit",
      Colour: "White",
      Status: true,
      year: 2020,
      vin: "VIN1",
      registration_plate: "AB12 CDE",
      asset_type: "Vehicle",
      engine_no: "ENG1",
      fuel_type: "diesel",
      tank_capacity: 80,
      fuel_consumption: 8.5,
      Groups: [{ Id: "g1", Group: "North" }]
    },
    device: {
      DeviceId: "d1",
      ImeiNumber: "123456789012345",
      AssignedAssetId: "100",
      Description: "FMB920",
      GsmNumber: "447700900123",
      SerialNumber: "DEV-SER"
    },
    sim: {
      GsmNo: "447700900123",
      SimSerial: "8944111122223333444",
      SimDesc: "Primary SIM",
      NetProvider: "Vodafone"
    },
    live: {
      ImeiNumber: "123456789012345",
      GPSDateTime: "2026-10-06T10:00:00",
      Location: "London",
      Odometer: 1200,
      WorkingHours: 40,
      VehicleSpeed: 32,
      EventName: "Ignition On",
      Lat: 51.5,
      Lon: -0.12
    },
    site: "Depot A",
    clientId: "c-1"
  });
  assert.equal(mapped.fleetNumber, "8944111122223333444");
  assert.equal(mapped.msisdn, "447700900123");
  assert.equal(mapped.imei, "123456789012345");
  assert.equal(mapped.assetDescription, "Van 1");
  assert.equal(mapped.registration, "AB12 CDE");
  assert.equal(mapped.make, "Ford");
  assert.equal(mapped.model, "Transit");
  assert.equal(mapped.year, "2020");
  assert.equal(mapped.vin, "VIN1");
  assert.equal(mapped.mobileDevice, "FMB920");
  assert.equal(mapped.odometer, "1200");
  assert.equal(mapped.engineHours, "40");
  assert.equal(mapped.lastLocation, "London");
  assert.equal(mapped.lastPosition, "2026-10-06T10:00:00");
  assert.equal(mapped.configGroup, "North");
  assert.equal(mapped.netProvider, "Vodafone");
  assert.equal(mapped.serialNumber, "DEV-SER");
  assert.equal(mapped.status, "available");

  const merged = mergeGpsIotFleetRows({
    assets: [{ AssetId: "100", Name: "Van 1", Status: true }],
    devices: [{ DeviceId: "d1", ImeiNumber: "123", AssignedAssetId: "100", GsmNumber: "4477" }],
    sims: [{ GsmNo: "4477", SimSerial: "SIM-9" }],
    live: [{ ImeiNumber: "123", Location: "Leeds", GPSDateTime: "2026-01-01T00:00:00" }],
    clientId: "c-1"
  });
  assert.equal(merged[0]?.fleetNumber, "SIM-9");
  assert.equal(merged[0]?.lastLocation, "Leeds");
});

test("asset save with AssetId uses Update APIs only (no Create / no duplicates)", async () => {
  assert.equal(resolveGpsIotAssetId({ id: "gpsiot:asset-9", assetId: "asset-9" }), "asset-9");
  assert.equal(resolveGpsIotAssetId({ assetId: 0 }), "");

  const urls: string[] = [];
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const result = await saveGpsIotAssetDetails(
    secrets,
    "token",
    {
      clientId: "c-1",
      assetId: "asset-9",
      assetDescription: "Van 1",
      make: "Ford",
      model: "Transit",
      assetTypeId: 3,
      registration: "AB12",
      fleetNumber: "SIM-1",
      deviceId: "dev-1",
      simCardId: "sim-1",
      imei: "123",
      msisdn: "4477"
    },
    async (input, init) => {
      const url = String(input);
      urls.push(`${String(init?.method ?? "GET")} ${url}`);
      return new Response(JSON.stringify({ Message: "ok" }), { status: 200 });
    }
  );
  assert.equal(result.created, false);
  assert.equal(result.updated, true);
  assert.equal(result.assetId, "asset-9");
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("/api/Asset/UpdateAsset")));
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("/api/Asset/UpdateAssetWithExtraDetails")));
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("/api/Asset/UpdateDevice")));
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("/api/Asset/UpdateSimcard")));
  assert.equal(urls.some((row) => row.includes("CreateAsset")), false);
});

test("SIM save maps ISP/MSISDN, updates existing by serial, and AssignSimCard links to device", async () => {
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const urls: string[] = [];
  const bodies: string[] = [];
  const saved = await saveGpsIotSimcard(
    secrets,
    "token",
    {
      clientId: "c-1",
      fleetNumber: "8944111122223333444",
      msisdn: "447700900123",
      deviceId: "dev-77"
    },
    async (input, init) => {
      const url = String(input);
      urls.push(`${String(init?.method ?? "GET")} ${url}`);
      bodies.push(String(init?.body ?? ""));
      if (url.includes("GetAllSimcard")) {
        return new Response(
          JSON.stringify({
            Asset: [{
              SimCardId: "sim-9",
              GsmNo: "447700900123",
              SimSerial: "8944111122223333444",
              SimDesc: "",
              NetProvider: "Vodafone"
            }]
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ Message: "ok" }), { status: 200 });
    }
  );
  assert.equal(saved.created, false);
  assert.equal(saved.updated, true);
  assert.equal(saved.simCardId, "sim-9");
  assert.equal(saved.assigned, true);
  assert.ok(urls.some((row) => row.includes("GetAllSimcard")));
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("UpdateSimcard")));
  assert.ok(urls.some((row) => row.includes("AssignSimCard")));
  assert.equal(urls.some((row) => row.includes("CreateSimcard")), false);
  assert.ok(bodies.some((body) => body.includes('"SimSerial":"8944111122223333444"') && body.includes('"GsmNo":"447700900123"')));
});

test("SIM create + assign when ISP is new (no duplicate update path)", async () => {
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const urls: string[] = [];
  let listed = false;
  const saved = await saveGpsIotSimcard(
    secrets,
    "token",
    { clientId: "c-1", fleetNumber: "SIM-NEW-1", msisdn: "4477111", deviceId: "dev-1" },
    async (input, init) => {
      const url = String(input);
      urls.push(`${String(init?.method ?? "GET")} ${url}`);
      if (url.includes("GetAllSimcard")) {
        // First list empty → create; second list after create returns id.
        if (!listed) {
          listed = true;
          return new Response(JSON.stringify({ Asset: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ Asset: [{ SimCardId: "sim-new", GsmNo: "4477111", SimSerial: "SIM-NEW-1" }] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ Message: "Simcard Added Successfully" }), { status: 200 });
    }
  );
  assert.equal(saved.created, true);
  assert.equal(saved.simCardId, "sim-new");
  assert.equal(saved.assigned, true);
  assert.ok(urls.some((row) => row.includes("CreateSimcard")));
  assert.ok(urls.some((row) => row.includes("AssignSimCard")));
});

test("device save looks up IMEI and updates instead of creating a duplicate", async () => {
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const urls: string[] = [];
  const saved = await saveGpsIotDevice(
    secrets,
    "token",
    { clientId: "c-1", imei: "123456789012345", assetId: "asset-9", mobileDevice: "FMB920" },
    async (input, init) => {
      const url = String(input);
      urls.push(`${String(init?.method ?? "GET")} ${url}`);
      if (url.includes("GetDeviceByIMEI")) {
        return new Response(
          JSON.stringify({ Asset: [{ DeviceId: "dev-77", ImeiNumber: 123456789012345, AssignedAssetId: "asset-9" }] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ Message: "ok" }), { status: 200 });
    }
  );
  assert.equal(saved.created, false);
  assert.equal(saved.updated, true);
  assert.equal(saved.deviceId, "dev-77");
  assert.ok(urls.some((row) => row.includes("GetDeviceByIMEI")));
  assert.ok(urls.some((row) => row.includes("PUT") && row.includes("/api/Asset/UpdateDevice")));
  assert.equal(urls.some((row) => row.includes("CreateDevice")), false);
});

test("device decommission unassigns then deletes so IMEI can be reused", async () => {
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const urls: string[] = [];
  let imeiLookupCount = 0;
  const result = await decommissionGpsIotDevice(
    secrets,
    "token",
    { clientId: "c-1", imei: "123456789012345", assetId: "asset-9", id: "gpsiot:asset-9" },
    async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      urls.push(`${method} ${url}`);
      if (url.includes("GetDeviceByIMEI")) {
        imeiLookupCount += 1;
        // First lookup finds the device; post-delete lookup must be empty.
        if (imeiLookupCount === 1) {
          return new Response(
            JSON.stringify({ Asset: [{ DeviceId: "dev-77", ImeiNumber: 123456789012345 }] }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ Asset: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ Message: "ok" }), { status: 200 });
    }
  );
  assert.equal(result.decommissioned, true);
  assert.equal(result.asset?.imei, "");
  assert.ok(urls.some((row) => row.includes("UnAssignSimcard")));
  assert.ok(urls.some((row) => row.includes("UnAssignAsset")));
  assert.ok(urls.some((row) => row.includes("DELETE") && row.includes("DeleteDevice")));
});

test("driver save with DriverID uses UpdateDriver only", async () => {
  assert.equal(resolveGpsIotDriverId({ id: "gpsiot-driver:d-1", driverId: "d-1" }), "d-1");
  const urls: string[] = [];
  const secrets = { baseUrl: "https://api.gpsiot.net", webApiKey: "k", webSecretKey: "s" };
  const updated = await saveGpsIotDriver(
    secrets,
    "token",
    {
      clientId: "c-1",
      driverId: "d-1",
      name: "Alex",
      mobileNumber: "0700",
      extendedDriverId: "TAG-1",
      employeeNumber: "E1",
      driverType: "RFID",
      licenceNo: "DL-1",
      licenseExpiryDate: "2027-06-07 21:00:00",
      driverDob: "1990-01-15",
      timeZone: "UTC"
    },
    async (input, init) => {
      urls.push(`${String(init?.method ?? "GET")} ${String(input)}`);
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.DriverType, "RFID");
      assert.equal(body.LicenceNo, "DL-1");
      assert.equal(body.license_expiry_date, "2027-06-07 21:00:00");
      assert.equal(body.DriverDOB, "1990-01-15");
      assert.equal(body.DriverID, "d-1");
      return new Response(JSON.stringify({ attachedAssetId: "d-1", status: "ok" }), { status: 200 });
    }
  );
  assert.equal(updated.created, false);
  assert.equal(updated.updated, true);
  assert.ok(urls[0]?.includes("/api/AttachedAsset/UpdateDriver"));
  assert.equal(urls.some((row) => row.includes("CreateDriver")), false);

  urls.length = 0;
  let createBody: Record<string, unknown> = {};
  const created = await saveGpsIotDriver(
    secrets,
    "token",
    { clientId: "c-1", name: "Blake", mobileNumber: "0701", extendedDriverId: "TAG-2", driverType: "Beacon" },
    async (input, init) => {
      urls.push(String(input));
      createBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ attachedAssetId: "d-2", status: "Driver Saved Successfully!" }), { status: 200 });
    }
  );
  assert.equal(created.created, true);
  assert.equal(created.driverId, "d-2");
  assert.ok(urls[0]?.includes("/api/AttachedAsset/CreateDriver"));
  assert.equal(createBody.TagNo, "TAG-2");
  assert.equal(createBody.DriverIDNo, "TAG-2");
  assert.equal(createBody.DriverType, "Beacon");
  assert.equal(createBody.DriverID, undefined);
});

test("POST /gpsiot/assets creates an asset and surfaces 409 conflicts", async () => {
  resetGpsIotTokenCache();
  const env = { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" };
  const ok = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/assets",
    env,
    databases: [],
    body: { clientId: "c-1", name: "Van 1", assetTypeId: 3, customId: "CUST-1" },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "abc", expires_in: 7200 }), { status: 200 });
      }
      assert.match(url, /\/api\/Asset\/CreateAsset$/);
      return new Response(JSON.stringify({ Message: "Asset Created Successfully!" }), { status: 200 });
    }
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.message, "Asset Created Successfully!");

  resetGpsIotTokenCache();
  const conflict = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/assets",
    env,
    databases: [],
    body: { clientId: "c-1", name: "Van 1", assetTypeId: 3 },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "abc", expires_in: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({ Message: "Asset Name Exists!" }), { status: 409 });
    }
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.ok, false);
  assert.equal(conflict.body.error, "Asset Name Exists!");
});

test("creating a site posts a GPS IoT client and keeps ClientID", async () => {
  resetGpsIotTokenCache();
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    calls.push({ url, method: String(init?.method ?? "GET"), body });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "abc", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.endsWith("/api/Client/CreateClient")) {
      return new Response(JSON.stringify({ ClientID: "client-9", Message: "Client Updated successfully" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const site = { name: "Karongo", gpsIotClientId: "" };
  const result = await ensureSiteGpsIotClient(
    { baseUrl: "https://api.gpsiot.net", webApiKey: "web-key", webSecretKey: "web-secret" },
    site,
    new Set(),
    fetchImpl
  );
  assert.equal(result.clientId, "client-9");
  assert.equal(result.created, true);
  assert.equal(site.gpsIotClientId, "client-9");
  const create = calls.find((call) => call.url.endsWith("/api/Client/CreateClient"));
  assert.equal(create?.method, "POST");
  const payload = JSON.parse(create?.body ?? "{}");
  assert.equal(payload.VCompanyName, "Karongo");
  assert.equal(payload.IsActive, true);
  assert.equal("ClientId" in payload, false);
});

test("a duplicate site name attaches the existing client", async () => {
  resetGpsIotTokenCache();
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "abc", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.endsWith("/api/Client/CreateClient")) {
      return new Response(JSON.stringify({ Message: "Client exists. Please choose another name!" }), { status: 409 });
    }
    if (url.endsWith("/api/Client/GetAllClients")) {
      return new Response(JSON.stringify({ client: [{ ClientId: "client-1", vCompanyName: "Karongo" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const site = { name: "karongo" };
  const result = await ensureSiteGpsIotClient(
    { baseUrl: "https://api.gpsiot.net", webApiKey: "web-key", webSecretKey: "web-secret" },
    site,
    new Set(),
    fetchImpl
  );
  assert.equal(result.attached, true);
  assert.equal(result.clientId, "client-1");
  assert.equal(emptyGpsIotClientProfile("Karongo").isActive, true);
});

test("GPS IoT trip ranges over 30 days are chunked for Utilisation / Historical", () => {
  const chunks = splitGpsIotRange(
    "2026-01-01T00:00:00.000Z",
    "2026-03-15T00:00:00.000Z",
    GPS_IOT_TRIPS_MAX_RANGE_MS
  );
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0]?.startTime, "2026-01-01T00:00:00.000Z");
  assert.equal(chunks[chunks.length - 1]?.endTime, "2026-03-15T00:00:00.000Z");
  for (const chunk of chunks) {
    const span = Date.parse(chunk.endTime) - Date.parse(chunk.startTime);
    assert.ok(span <= GPS_IOT_TRIPS_MAX_RANGE_MS);
  }
  assert.equal(
    splitGpsIotRange("2026-10-01T00:00:00.000Z", "2026-10-10T00:00:00.000Z").length,
    1
  );
});

test("summary outside DailySummary / mileage limits falls back to Detailed Movement GetTrips", async () => {
  resetGpsIotTokenCache();
  resetGpsIotTripFetchCache();
  const seen: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "abc", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.includes("/api/DailySummary/GetDailySummary") || url.includes("/api/trip/GetClientAssetsMileage")) {
      return new Response(JSON.stringify({ message: "The maximum allowed duration is 24 hours." }), { status: 400 });
    }
    if (url.includes("/api/Trip/GetTrips")) {
      return new Response(JSON.stringify([{ TripId: "long-1", IsInProgress: false, IsStoppageItem: false }]), { status: 200 });
    }
    if (url.endsWith("/api/Trip/GetTripDetails")) {
      return new Response(JSON.stringify({
        Trip: {
          StartDate: "2026-01-02 08:00:00",
          EndDate: "2026-01-02 09:00:00",
          LocationStart: "A",
          LocationEnd: "B",
          Distance: 25,
          MaxSpeed: 60,
          AvgSpeed: 40,
          TotalSeconds: 3600,
          InitialLatitude: 51.5,
          InitialLongitude: -0.12,
          FinalLatitude: 51.51,
          FinalLongitude: -0.11
        }
      }), { status: 200 });
    }
    return new Response(String(init?.body ?? ""), { status: 404 });
  };

  // 45-day window: skips DailySummary (24h) and ClientAssetsMileage (30d) → GetTrips.
  const result = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/trips/summary",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: {
      imei: "356938035643809",
      clientId: "client-1",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-02-15T00:00:00.000Z"
    },
    fetchImpl
  });
  assert.equal(result.status, 200);
  const row = (result.body.summary as Array<{ distance: number; tripCount: number; source: string }>)?.[0];
  assert.equal(row?.source, "trips");
  assert.equal(row?.distance, 25000);
  assert.equal(row?.tripCount, 1);
  assert.equal(seen.some((url) => url.includes("/api/DailySummary/GetDailySummary")), false);
  assert.equal(seen.some((url) => url.includes("/api/trip/GetClientAssetsMileage")), false);
  assert.ok(seen.some((url) => url.includes("/api/Trip/GetTrips")));
});

test("mileage summary maps onto Traccar trips, stops, route, and summary", () => {
  const trips = parseGpsIotMileageTrips(
    {
      Data: [
        {
          StartDate: "2026-10-05 08:00:00",
          EndDate: "2026-10-05 09:00:00",
          Hours: 1,
          Minutes: 0,
          Seconds: 0,
          Distance: 42.5,
          StartSpeed: 10,
          EndSpeed: 55,
          LocationStart: "Depot",
          LocationEnd: "Yard",
          StartLatitude: 51.5,
          StartLongitude: -0.12,
          SecondLatitude: 51.52,
          SecondLongitude: -0.1,
          IsStoppageItem: false,
          IsInProgress: false
        },
        {
          StartDate: "2026-10-05 09:00:00",
          EndDate: "2026-10-05 09:30:00",
          Hours: 0,
          Minutes: 30,
          Seconds: 0,
          Distance: 0,
          LocationStart: "Yard",
          LocationEnd: "Yard",
          StartLatitude: 51.52,
          StartLongitude: -0.1,
          SecondLatitude: 51.52,
          SecondLongitude: -0.1,
          IsStoppageItem: true
        }
      ]
    },
    { imei: "356938035643809", deviceName: "Van 1" }
  );
  assert.equal(trips.length, 2);
  assert.equal(trips[0]?.distance, 42500);
  assert.equal(trips[0]?.duration, 3_600_000);
  assert.equal(trips[0]?.startAddress, "Depot");
  assert.equal(trips[0]?.isStoppage, false);
  assert.equal(trips[1]?.isStoppage, true);
  assert.equal(toGpsIotDateTime("2026-10-05T08:00:00.000Z"), "2026-10-05 08:00:00");
  assert.equal(toGpsIotTripDateTime("2026-10-05T08:00:00.000Z"), "2026/10/05 08:00:00");

  const route = tripsToRoutePoints(trips.filter((trip) => !trip.isStoppage));
  assert.equal(route.length, 2);
  assert.equal(route[0]?.latitude, 51.5);
  assert.equal(route[1]?.longitude, -0.1);

  const daily = parseGpsIotDailySummary({
    VehicleId: "v-1",
    RegNo: "AB12 CDE",
    DriverName: "Alex",
    MaxSpeed: 98,
    NoOfHarshBraking: 1,
    NoOfHarshAccel: 2,
    DailyDistance: 120.4,
    NoOfDailyTrips: 6,
    ExcessIdlingTime: 400,
    DrivingTime: 18000,
    SpeedingTime: 300
  });
  assert.equal(daily[0]?.registration, "AB12 CDE");
  assert.equal(daily[0]?.dailyDistance, 120.4);

  const mileage = parseGpsIotClientMileage({
    asset: "Van 1",
    imei: "356938035643809",
    start_odometer: 1000,
    end_odometer: 1120,
    distance: 120,
    current_odometer: 1120
  });
  assert.equal(mileage[0]?.distance, 120);
  assert.equal(mileage[0]?.imei, "356938035643809");
});

test("GetTripDetails maps Detailed Movement columns (distance m, maxSpeed knots, duration ms)", () => {
  const trip = parseGpsIotTripDetails(
    {
      Trip: {
        StartDate: "2026-10-05 08:15:00",
        EndDate: "2026-10-05 09:00:00",
        LocationStart: "Depot Gate",
        LocationEnd: "Customer Yard",
        Distance: 18.4,
        IsStoppageItem: false,
        AvgSpeed: 36.8,
        MaxSpeed: 74,
        TotalSeconds: 2700,
        InitialLatitude: 51.5,
        InitialLongitude: -0.12,
        FinalLatitude: 51.55,
        FinalLongitude: -0.08,
        AttachedAsset: "Alex Driver"
      }
    },
    { tripId: "trip-1", imei: "356938035643809", deviceName: "Van 1", isStoppage: false }
  );
  assert.ok(trip);
  assert.equal(trip?.distance, 18400);
  assert.equal(trip?.duration, 2_700_000);
  assert.ok(Math.abs((trip?.maxSpeed ?? 0) - (74 / 1.852)) < 0.001);
  assert.equal(Math.round((trip?.maxSpeed ?? 0) * 1.852), 74);
  assert.equal(trip?.driverName, "Alex Driver");
  assert.equal(trip?.startAddress, "Depot Gate");
  assert.equal(trip?.endAddress, "Customer Yard");

  const parked = parseGpsIotTripDetails(
    {
      Parked: {
        TotalTimeParked: 900,
        LocationpParked: "Customer Yard",
        Latitude: "51.55",
        Longitude: "-0.08"
      }
    },
    { tripId: "park-1", imei: "356938035643809", isStoppage: true }
  );
  assert.ok(parked);
  assert.equal(parked?.isStoppage, true);
  assert.equal(parked?.duration, 900_000);
  assert.equal(parked?.startAddress, "Customer Yard");
});

test("POST /gpsiot/trips uses GetMileageSummary and falls back only when mileage is empty", async () => {
  resetGpsIotTokenCache();
  resetGpsIotTripFetchCache();
  const seen: Array<{ url: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    seen.push({ url, body });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "abc", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.includes("/api/Trip/GetTrips")) {
      return new Response(JSON.stringify([
        { TripId: "t-move", IsInProgress: false, IsStoppageItem: false },
        { TripId: "t-park", IsInProgress: false, IsStoppageItem: true }
      ]), { status: 200 });
    }
    if (url.endsWith("/api/Trip/GetTripDetails")) {
      const tripId = String(JSON.parse(body || "{}").TripId ?? "");
      if (tripId === "t-move") {
        return new Response(JSON.stringify({
          Trip: {
            StartDate: "2026-10-05 08:00:00",
            EndDate: "2026-10-05 09:00:00",
            LocationStart: "A",
            LocationEnd: "B",
            Distance: 10,
            MaxSpeed: 50,
            AvgSpeed: 40,
            TotalSeconds: 3600,
            InitialLatitude: 51.5,
            InitialLongitude: -0.12,
            FinalLatitude: 51.51,
            FinalLongitude: -0.11,
            AttachedAsset: "Sam"
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        Parked: {
          TotalTimeParked: 1200,
          LocationpParked: "B",
          Latitude: "51.51",
          Longitude: "-0.11"
        },
        Trip: {
          StartDate: "2026-10-05 09:00:00",
          EndDate: "2026-10-05 09:20:00",
          LocationStart: "B",
          LocationEnd: "B"
        }
      }), { status: 200 });
    }
    if (url.endsWith("/api/Trip/GetMileageSummary")) {
      return new Response(JSON.stringify({
        Data: [
          {
            StartDate: "2026-10-05 08:00:00",
            EndDate: "2026-10-05 09:00:00",
            Hours: 1,
            Minutes: 0,
            Seconds: 0,
            Distance: 10,
            MaxSpeed: 50,
            AttachedAsset: "Sam",
            StartLatitude: 51.5,
            StartLongitude: -0.12,
            SecondLatitude: 51.51,
            SecondLongitude: -0.11,
            LocationStart: "A",
            LocationEnd: "B",
            IsStoppageItem: false
          },
          {
            StartDate: "2026-10-05 09:00:00",
            EndDate: "2026-10-05 09:20:00",
            Hours: 0,
            Minutes: 20,
            Seconds: 0,
            Distance: 0,
            LocationStart: "B",
            LocationEnd: "B",
            StartLatitude: 51.51,
            StartLongitude: -0.11,
            IsStoppageItem: true
          }
        ]
      }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };

  const trips = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/trips",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { imei: "356938035643809", startTime: "2026-10-05T07:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z" },
    fetchImpl
  });
  assert.equal(trips.status, 200);
  assert.equal(Array.isArray(trips.body.trips) && trips.body.trips.length, 1);
  const moving = (trips.body.trips as Array<{ distance: number; maxSpeed: number; driverName: string; duration: number }>)[0];
  assert.equal(moving?.distance, 10000);
  assert.equal(moving?.duration, 3_600_000);
  assert.equal(moving?.driverName, "Sam");
  assert.equal(Math.round((moving?.maxSpeed ?? 0) * 1.852), 50);
  assert.ok(seen.some((call) => call.url.endsWith("/api/Trip/GetMileageSummary")));
  assert.equal(seen.some((call) => call.url.endsWith("/api/Trip/GetTripDetails")), false);

  const route = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/trips/route",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { imei: "356938035643809", startTime: "2026-10-05T07:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z" },
    fetchImpl
  });
  assert.equal(route.status, 200);
  assert.equal(Array.isArray(route.body.positions) && route.body.positions.length, 2);
  assert.ok(seen.some((call) => call.url.endsWith("/api/Trip/GetMileageSummary")));

  const stops = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/trips/stops",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { imei: "356938035643809", startTime: "2026-10-05T07:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z" },
    fetchImpl
  });
  assert.equal(stops.status, 200);
  assert.equal(Array.isArray(stops.body.stops) && stops.body.stops.length, 1);
  assert.equal((stops.body.stops as Array<{ duration: number }>)[0]?.duration, 1_200_000);

  const summary = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/trips/summary",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { imei: "356938035643809", startTime: "2026-10-05T07:00:00.000Z", endTime: "2026-10-05T10:00:00.000Z" },
    fetchImpl
  });
  assert.equal(summary.status, 200);
  assert.equal(Array.isArray(summary.body.summary) && summary.body.summary.length, 1);
  assert.equal((summary.body.summary as Array<{ distance: number }>)[0]?.distance, 10000);
});
test("GPS IoT circular geofences parse and map onto Control Location area WKT", () => {
  const rows = parseGpsIotGeofenceRows({
    Geofence: [{
      GeoID: "geo-1",
      GeoName: "Depot",
      GeoRadius: 250,
      Lat: 51.5,
      Lon: -0.12,
      Contact: "Alex",
      ContactTel: "07000000000"
    }]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "Depot");
  assert.equal(rows[0]?.shape.type, "circle");
  assert.equal(gpsIotShapeToArea(rows[0]!.shape), "CIRCLE (51.5 -0.12, 250)");
});

test("geofence save deletes prior GeoID then creates so updates never duplicate", async () => {
  resetGpsIotTokenCache();
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    calls.push({ url, body });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/GetGeofenceByClient")) {
      return new Response(JSON.stringify({
        Geofence: [{ GeoID: "old-1", GeoName: "Depot", GeoRadius: 100, Lat: 51.5, Lon: -0.12 }]
      }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/DeleteGeofence")) {
      return new Response(JSON.stringify({ Message: "Geofence deleted successfully" }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/CreateGeofence")) {
      return new Response(JSON.stringify({ GeofenceID: "new-9", status: "Geofence Created Successfully!" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };

  const saved = await saveGpsIotGeofence(
    { baseUrl: "https://api.gpsiot.net", webApiKey: "web-key", webSecretKey: "web-secret" },
    "tok",
    {
      clientId: "client-1",
      name: "Depot",
      shape: { type: "circle", center: { lat: 51.51, lng: -0.11 }, radius: 300 },
      contact: "Alex",
      contactTel: "07000000000"
    },
    fetchImpl
  );
  assert.equal(saved.geoId, "new-9");
  assert.equal(saved.replaced, true);
  assert.equal(saved.deletedPriorId, "old-1");
  assert.ok(calls.some((call) => call.url.endsWith("/api/Geofence/DeleteGeofence") && call.body.includes("old-1")));
  assert.ok(calls.some((call) => call.url.endsWith("/api/Geofence/CreateGeofence") && call.body.includes("\"GeoRadius\":300")));
});

test("POST /gpsiot/geofences/save and delete avoid duplicates and clear remote rows", async () => {
  resetGpsIotTokenCache();
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/GetGeofenceByClient")) {
      return new Response(JSON.stringify({ Geofence: [] }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/CreatePolygonGeofence")) {
      return new Response(JSON.stringify({ id: "poly-1" }), { status: 200 });
    }
    if (url.endsWith("/api/Geofence/DeleteGeofence")) {
      return new Response(JSON.stringify({ Message: "Geofence deleted successfully" }), { status: 200 });
    }
    return new Response(String(init?.body ?? ""), { status: 404 });
  };

  const saved = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/geofences/save",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: {
      clientId: "client-1",
      name: "Yard",
      shape: {
        type: "polygon",
        points: [
          { lat: 51.5, lng: -0.12 },
          { lat: 51.51, lng: -0.12 },
          { lat: 51.51, lng: -0.11 }
        ]
      }
    },
    fetchImpl
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.geoId, "poly-1");
  assert.ok(calls.some((url) => url.endsWith("/api/Geofence/CreatePolygonGeofence")));

  const deleted = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/geofences/delete",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { clientId: "client-1", geoId: "poly-1", name: "Yard" },
    fetchImpl
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.ok(calls.some((url) => url.endsWith("/api/Geofence/DeleteGeofence")));
});

test("geofence list refuses database-only resolution so sites never share ClientIDs", async () => {
  resetGpsIotTokenCache();
  const result = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/geofences/list",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [{ id: "db-1", name: "Fleet DB", dealerName: "D", organisationName: "O" }],
    body: { databaseName: "Fleet DB" },
    fetchImpl: async () => new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 7200 }), { status: 200 })
  });
  assert.equal(result.status, 400);
  assert.match(String(result.body.error ?? ""), /site-scoped|clientId or site/i);
});

test("Data Forwarding Common JSON parses into Live Tracking devices", async () => {
  const { parseGpsIotForwardedLivePayload, mergeGpsIotLiveDevices } = await import("./forwarding.ts");
  const devices = parseGpsIotForwardedLivePayload({
    Data: [{
      DeviceName: "Van 1",
      ImeiNumber: "356938035643809",
      VehicleSpeed: 42,
      RoadSpeed: 60,
      Odometer: 12.5,
      Heading: 90,
      Lat: "51.5",
      Lon: "-0.12",
      Location: "London",
      EventName: "Harsh Braking",
      GPSDateTime: "2026-04-06T10:00:00",
      IsIgnitionOn: "True",
      Battery: 88,
      Altitude: "120",
      SensorData: '{"An1": 134, "An2": 345}',
      WorkingHours: 9,
      Attributes: '{"S": 16, "P": 12.35}'
    }]
  });
  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.imei, "356938035643809");
  assert.equal(devices[0]?.latitude, 51.5);
  assert.equal(devices[0]?.speed, 42);
  assert.equal(devices[0]?.roadSpeed, 60);
  assert.equal(devices[0]?.ignition, true);
  assert.equal(devices[0]?.eventName, "Harsh Braking");
  assert.equal(devices[0]?.batteryLevel, 88);
  assert.equal(devices[0]?.satellites, 16);
  assert.equal(devices[0]?.powerVoltage, 12.35);
  assert.equal(devices[0]?.odometerM, 12500);
  assert.equal(devices[0]?.sensorData.An1, 134);
  assert.equal(devices[0]?.attributes.sat, 16);
  assert.equal(devices[0]?.attributes.power, 12.35);
  assert.equal(devices[0]?.attributes.io1, 134);
  assert.equal(devices[0]?.attributes.alarm, "Harsh Braking");

  const merged = mergeGpsIotLiveDevices(
    [{
      id: "1",
      name: "Old",
      imei: "356938035643809",
      latitude: 1,
      longitude: 1,
      speed: 0,
      roadSpeed: 0,
      course: 0,
      address: "",
      deviceTime: "",
      ignition: false,
      eventName: "",
      batteryLevel: 0,
      altitude: 0,
      odometerM: 0,
      workingHours: 0,
      satellites: 0,
      powerVoltage: 0,
      sensorData: {},
      attributes: {}
    }],
    devices
  );
  assert.equal(merged[0]?.latitude, 51.5);
  assert.equal(merged[0]?.eventName, "Harsh Braking");
});

test("POST /gpsiot/forwarding/ensure creates provider and assigns site ClientID", async () => {
  resetGpsIotTokenCache();
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let providerSaved = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = String(init?.body ?? "");
    calls.push({ url, method, body });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.includes("/GetDataFwdProviders")) {
      return new Response(JSON.stringify({
        Providers: providerSaved
          ? [{
              provider_id: 77,
              forwarding_endpoint: "https://uk.vivitelematics.ca/ingest/gpsiot?tenant=t1",
              forwarding_name: "Vivitel Live Depot",
              forwarding_expiry_time: "2030-12-31T23:59:59",
              format_name: "Common JSON",
              protocol_name: "HTTP"
            }]
          : []
      }), { status: 200 });
    }
    if (url.includes("/SaveDataFwdProvider")) {
      providerSaved = true;
      return new Response(JSON.stringify({ Message: "Provider Created Successfully!" }), { status: 200 });
    }
    if (url.includes("/SaveDataFwdDevice")) {
      return new Response(JSON.stringify({ Message: "Data forwarding to asset saved successfully." }), { status: 200 });
    }
    return new Response(body, { status: 404 });
  };

  const result = await handleGpsIotRequest({
    region: "uk",
    method: "POST",
    pathname: "/gpsiot/forwarding/ensure",
    env: {
      GPSIOT_WEB_API_KEY: "web-key",
      GPSIOT_WEB_SECRET_KEY: "web-secret",
      GPSIOT_FORWARD_TOKEN: "fwd-secret"
    },
    databases: [],
    body: {
      clientId: "client-9",
      site: "Depot",
      ingestUrl: "https://uk.vivitelematics.ca/ingest/gpsiot?tenant=t1",
      token: "fwd-secret"
    },
    fetchImpl
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.providerId, 77);
  assert.ok(calls.some((call) => call.url.includes("/SaveDataFwdProvider")));
  assert.ok(calls.some((call) => call.url.includes("/SaveDataFwdDevice") && call.body.includes("client-9")));
});

test("DELETE forwarding provider uses ProviderID body", async () => {
  resetGpsIotTokenCache();
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: String(init?.method ?? "GET"), body: String(init?.body ?? "") });
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({ access_token: "tok", token_type: "bearer", expires_in: 7200 }), { status: 200 });
    }
    if (url.includes("/UpdateProvider") && String(init?.method).toUpperCase() === "DELETE") {
      return new Response(JSON.stringify({ Message: "Data forwarding Provider deleted successfully.." }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const result = await handleGpsIotRequest({
    region: "uk",
    method: "DELETE",
    pathname: "/gpsiot/forwarding/providers",
    env: { GPSIOT_WEB_API_KEY: "web-key", GPSIOT_WEB_SECRET_KEY: "web-secret" },
    databases: [],
    body: { ProviderID: 42 },
    fetchImpl
  });
  assert.equal(result.status, 200);
  assert.ok(calls.some((call) => call.method === "DELETE" && call.body.includes("42")));
});
