import { beforeEach, describe, expect, it } from "vitest";
import {
  cms808DisplayTime,
  cms808EvidenceKind,
  cms808PhotoUrl,
  cms808VehicleToLiveRow,
  overlayCms808LiveFields,
  CMS808_KNOWN_GPS,
  CMS808_KNOWN_VEHICLE,
  cms808PlaybackFileWindow,
  filterCms808VehiclesForActiveHierarchy,
  flattenCms808TrackRows,
  isCms808LiveAsset,
  isCms808AuthenticatedStreamUrl,
  isCms808PlayerUrl,
  loadCms808VehiclesForActiveHierarchy,
  mapCms808AlarmTypeToVt,
  buildCms808TimelineTrips,
  mapCms808TracksToTrailPoints,
  newestCms808TrackPoint,
  parseCms808GpsRow,
  parseCms808LatLng,
  pickNewerCms808Fix
} from "./cms808";

const installMemoryStorage = () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
  (globalThis as any).window = { localStorage, location: { hostname: "127.0.0.1" } };
  (globalThis as any).localStorage = localStorage;
};

describe("cms808 helpers", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("parses mapped and scaled GPS coordinates", () => {
    expect(parseCms808LatLng({ mlat: 0.3476, mlng: 32.5825 })).toEqual({ lat: 0.3476, lng: 32.5825 });
    expect(parseCms808LatLng({ lat: 347600, lng: 32582500 })).toEqual({ lat: 0.3476, lng: 32.5825 });
    expect(parseCms808LatLng({ weiDu: 0.638689, jingDu: 34.25605 })).toEqual({ lat: 0.638689, lng: 34.25605 });
    expect(parseCms808LatLng({})).toEqual({});
  });

  it("unwraps GPS payload arrays", () => {
    expect(parseCms808GpsRow([{ vid: "UBP-119H", ol: 1 }])).toEqual({ vid: "UBP-119H", ol: 1 });
    expect(parseCms808GpsRow({ infos: [{ mlat: 0.63, mlng: 34.25 }] })).toEqual({ mlat: 0.63, mlng: 34.25 });
    expect(parseCms808GpsRow(null)).toBeNull();
  });

  it("keeps the newest device-status fix when the platform returns an old row first", () => {
    const row = parseCms808GpsRow([
      { mlat: 0.638689, mlng: 34.25605, gt: "2026-09-19 01:22:00" },
      { gps: { mlat: 1.0821, mlng: 34.175, gt: "2026-10-06 09:40:00" } }
    ]);
    expect(row?.mlat).toBe(1.0821);
    expect(row?.gt).toBe("2026-10-06 09:40:00");
  });

  it("overlays a newer 808 fix onto a fleet row stuck on 19 September", () => {
    const stored = {
      id: "asset-ubp",
      imei: "020262202629",
      registration: "UBP-119H",
      lastPosition: "19/09/2026 01:22:00 EAT",
      lastSeen: "2026-09-19 01:22:00",
      lat: 0.638689,
      lng: 34.25605
    };
    const live = {
      id: "cms808:020262202629",
      imei: "020262202629",
      lat: 1.0821,
      lng: 34.175,
      lastSeen: "2026-10-06 09:40:00",
      lastPosition: "06/10/2026 09:40:00 EAT",
      speed: 42,
      movement: "moving"
    };
    const next = overlayCms808LiveFields(stored, live);
    expect(next.lastSeen).toBe("2026-10-06T09:40:00+03:00");
    expect(next.lat).toBe(1.0821);
    expect(overlayCms808LiveFields(stored, { ...live, lastSeen: "2026-09-19 01:22:00", lat: 0.1, lng: 34 }).lat).toBe(0.638689);
  });

  it("treats safety clips as video evidence", () => {
    expect(cms808EvidenceKind({ mediaType: 1 }, "https://gps.example/clip")).toBe("video");
    expect(cms808EvidenceKind({ DownUrl: "https://gps.example/pic.jpg" }, "https://gps.example/pic.jpg")).toBe("image");
    expect(cms808PhotoUrl({ videoUrl: "https://gps.example/clip.mp4" })).toBe("https://gps.example/clip.mp4");
  });

  it("keeps 808 vehicles under Karongo and hides them on other sites", () => {
    const vehicles = [
      { vehiIdno: "UBP-119H", devIdno: "020262202629", company: "Karongo" },
      { vehiIdno: "OTHER", devIdno: "999", company: "Elsewhere" }
    ];
    (window as any).location.hostname = "za.vivitelematics.com";
    window.localStorage.setItem("vivi.activeSite", "Default");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / OTHER / Default");
    expect(filterCms808VehiclesForActiveHierarchy(vehicles)).toEqual([]);

    window.localStorage.setItem("vivi.activeSite", "Karongo");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / Advanced Securities / Karongo");
    expect(filterCms808VehiclesForActiveHierarchy(vehicles)).toHaveLength(2);

    (window as any).location.hostname = "uk.vivitelematics.com";
    expect(filterCms808VehiclesForActiveHierarchy(vehicles)).toEqual([]);
  });

  it("shows vendor-company 808 cameras when Advanced Securities is selected", () => {
    const vehicles = [{ vehiIdno: "UBP-119H", devIdno: "020262202629", company: "A10564" }];
    (window as any).location.hostname = "za.vivitelematics.com";
    window.localStorage.setItem("vivi.activeSite", "MMULU COMPANY");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / TRANSFLEET SERVICES / MMULU COMPANY");
    expect(filterCms808VehiclesForActiveHierarchy(vehicles)).toEqual([]);

    expect(
      filterCms808VehiclesForActiveHierarchy(vehicles, ["AFRICA", "EAST AFRICA", "Advanced Securities", "Karongo"]).map((row) => row.vehiIdno)
    ).toEqual(["UBP-119H"]);
  });

  it("reads evidence photo URLs from vendor fields", () => {
    expect(cms808PhotoUrl({ DownUrl: "https://gps.example/pic.jpg" })).toBe("https://gps.example/pic.jpg");
  });

  it("keeps odometer samples when the GPS coordinate does not move", () => {
    const trail = mapCms808TracksToTrailPoints([
      { mlat: -3.99, mlng: 39.56, gt: "2026-10-01 08:00:00", sp: 0, lc: 1000000 },
      { mlat: -3.99, mlng: 39.56, gt: "2026-10-01 08:30:00", sp: 0, lc: 1025000 }
    ]);
    expect(trail).toHaveLength(2);
    expect(trail[1]?.odometerM).toBe(1025000);
  });

  it("does not turn parked heartbeats into a zero-distance trip", () => {
    const start = Date.parse("2026-10-08T16:16:00Z");
    const trips = buildCms808TimelineTrips([
      { lat: -3.990134, lng: 39.566086, atMs: start, speedKph: 0, odometerM: 3599200 },
      { lat: -3.990149, lng: 39.56614, atMs: start + 3 * 60 * 60 * 1000, speedKph: 0, odometerM: 3599200 }
    ]);
    expect(trips).toEqual([]);
  });

  it("counts distance from movement when the speed field stays zero", () => {
    const start = Date.parse("2026-10-01T05:00:00Z");
    const trips = buildCms808TimelineTrips([
      { lat: -2.694288, lng: 38.167001, atMs: start, speedKph: 0, odometerM: 3296000 },
      { lat: -2.85, lng: 38.45, atMs: start + 60 * 60 * 1000, speedKph: 0, odometerM: 3346000 },
      { lat: -3.05, lng: 38.75, atMs: start + 2 * 60 * 60 * 1000, speedKph: 0, odometerM: 3396000 },
      { lat: -3.3, lng: 39.05, atMs: start + 3 * 60 * 60 * 1000, speedKph: 0, odometerM: 3446000 },
      { lat: -3.55, lng: 39.3, atMs: start + 4 * 60 * 60 * 1000, speedKph: 0, odometerM: 3496000 },
      { lat: -3.991641, lng: 39.562553, atMs: start + 5 * 60 * 60 * 1000, speedKph: 0, odometerM: 3542900 }
    ]);
    expect(trips.length).toBeGreaterThan(0);
    expect(trips.reduce((sum, trip) => sum + trip.distanceKm, 0)).toBeGreaterThan(100);
  });

  it("uses the odometer when a GPS jump is too large to be a real step", () => {
    const start = Date.parse("2026-09-08T07:50:00Z");
    const trips = buildCms808TimelineTrips([
      { lat: 22.596158, lng: 114.007027, atMs: start, speedKph: 0, odometerM: 1000 },
      { lat: 0.379242, lng: 32.871074, atMs: start + 60 * 60 * 1000, speedKph: 0, odometerM: 5000 }
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]?.distanceKm).toBeGreaterThan(3);
    expect(trips[0]?.distanceKm).toBeLessThan(10);
  });

  it("maps 808 track rows into a drawable trail", () => {
    const trail = mapCms808TracksToTrailPoints([
      { mlat: 0.638689, mlng: 34.25605, gt: "2026-09-19 01:00:00", sp: 12 },
      { mlat: 0.6401, mlng: 34.2582, gt: "2026-09-19 01:08:00", sp: 16 },
      { mlat: 0.6401, mlng: 34.2582, gt: "2026-09-19 01:08:00", sp: 16 }
    ]);
    expect(trail).toHaveLength(2);
    expect(trail[0]?.lat).toBe(0.638689);
    expect(trail[1]?.lng).toBe(34.2582);
  });

  it("flattens packed and trip-segment playback tracks", () => {
    expect(flattenCms808TrackRows("0.638689,34.25605,2026-09-19 01:00:00;0.6401,34.2582,2026-09-19 01:08:00")).toHaveLength(2);
    const segments = flattenCms808TrackRows({
      infos: [{ bLat: 0.61, bLng: 34.2, eLat: 0.64, eLng: 34.26, bTime: "2026-09-19 00:10:00", eTime: "2026-09-19 01:10:00" }]
    });
    expect(segments).toHaveLength(2);
    expect(mapCms808TracksToTrailPoints(segments)).toHaveLength(2);
  });

  it("reads remote playback file windows", () => {
    const window = cms808PlaybackFileWindow(
      { year: 2026, mon: 9, day: 18, beg: 36000, end: 43200 },
      new Date(2026, 8, 18)
    );
    expect(window?.from.getHours()).toBe(10);
    expect(window?.to.getHours()).toBe(12);
  });

  it("keeps 808 cameras distinct from Traccar assets", () => {
    expect(isCms808LiveAsset({ id: "cms808:020262202629" })).toBe(true);
    expect(isCms808LiveAsset({ id: "asset-25", device: "CMS 808" })).toBe(true);
    expect(isCms808LiveAsset({ id: "asset-25", registration: "UBP-119H", imei: "020262202629" })).toBe(false);
  });

  it("moves a stale border fix to the later trip point", () => {
    const status = { mlat: 0.638689, mlng: 34.25605, gt: "2026-09-20 08:00:00", sp: 0 };
    const later = { mlat: 0.3476, mlng: 32.5825, gt: "2026-09-24 16:40:00", sp: 48 };
    const picked = pickNewerCms808Fix(status, later);
    expect(picked?.mlat).toBe(0.3476);
    expect(picked?.mlng).toBe(32.5825);
    expect(picked?.gt).toBe("2026-09-24 16:40:00");
    expect(pickNewerCms808Fix(later, status)?.mlat).toBe(0.3476);
  });

  it("keeps the newest track point when parked samples fill earlier pages", () => {
    const latest = newestCms808TrackPoint([
      { mlat: 0.638689, mlng: 34.25605, gt: "2026-09-20 08:00:00" },
      { mlat: 1.2921, mlng: 36.8219, gt: "2026-09-25 09:15:00" }
    ]);
    expect(latest?.mlat).toBe(1.2921);
    expect(latest?.mlng).toBe(36.8219);
  });

  it("reads a live status fix south of the equator", () => {
    const row = parseCms808GpsRow([
      {
        id: "020262202629",
        vid: "UBP-119H",
        mlat: "-3.990161",
        mlng: "39.566148",
        gt: "2026-10-06 03:05:28.0",
        sp: 0,
        ol: 0
      }
    ]);
    expect(parseCms808LatLng(row).lat).toBeCloseTo(-3.990161, 5);
    expect(parseCms808LatLng(row).lng).toBeCloseTo(39.566148, 5);
    expect(cms808DisplayTime(row?.gt)).toBe("06/10/2026 03:05:28 EAT");
  });

  it("formats last position as a site clock instead of ISO", () => {
    expect(cms808DisplayTime("2026-09-19 01:22:00")).toBe("19/09/2026 01:22:00 EAT");
    expect(cms808DisplayTime("2026-09-18T23:22:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} EAT$/);
    const row = cms808VehicleToLiveRow(CMS808_KNOWN_VEHICLE, CMS808_KNOWN_GPS);
    expect(row.lastPosition).toBe("19/09/2026 01:22:00 EAT");
    expect(row.speed).toBe("0");
    expect(row.movement).toBe("stationary");
    expect(row.status).toBe("warning");
  });

  it("maps vendor alarm names onto video dashboard types", () => {
    expect(mapCms808AlarmTypeToVt("Video loss")).toBe("Ai: Video loss");
    expect(mapCms808AlarmTypeToVt("Forward collision")).toBe("Ai: Forward collision warning");
    expect(mapCms808AlarmTypeToVt("Ai: Driver smoking")).toBe("Ai: Driver smoking");
  });

  it("treats 808 HTML players as iframe streams", () => {
    expect(isCms808PlayerUrl("https://gps.hboiot.com:8088/808gps/open/player/video.html?devIdno=1")).toBe(true);
    expect(isCms808PlayerUrl("https://media.example/live.m3u8")).toBe(false);
  });

  it("requires jsession before treating an 808 player URL as ready", () => {
    expect(isCms808AuthenticatedStreamUrl("https://gps.hboiot.com:8088/808gps/open/player/video.html?devIdno=1")).toBe(false);
    expect(
      isCms808AuthenticatedStreamUrl("https://gps.hboiot.com:8088/808gps/open/player/video.html?jsession=abc&devIdno=1")
    ).toBe(true);
  });

  it("seeds Karongo with UBP-119H when the 808 API is empty", async () => {
    (globalThis as any).fetch = async () => ({ ok: false, status: 404, json: async () => null });
    (window as any).location.hostname = "za.vivitelematics.com";
    window.localStorage.setItem("vivi.activeSite", "Karongo");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / Advanced Securities / Karongo");
    const rows = await loadCms808VehiclesForActiveHierarchy(["Advanced Securities", "Karongo"]);
    expect(rows.map((row) => row.vehiIdno)).toEqual(["UBP-119H"]);
  });

  it("does not call 808 APIs on the US Traccar server host", async () => {
    let called = 0;
    (globalThis as any).fetch = async () => {
      called += 1;
      return { ok: false, status: 405, json: async () => null };
    };
    (globalThis as any).window.location = { hostname: "us.vivitelematics.ca" };
    window.localStorage.setItem("vivi.activeSite", "Karongo");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / Advanced Securities / Karongo");
    const rows = await loadCms808VehiclesForActiveHierarchy(["Advanced Securities", "Karongo"]);
    expect(rows).toEqual([]);
    expect(called).toBe(0);
  });

  it("does not call 808 APIs when a Traccar site is selected", async () => {
    let called = 0;
    (globalThis as any).fetch = async () => {
      called += 1;
      return { ok: false, status: 405, json: async () => null };
    };
    window.localStorage.setItem("vivi.activeSite", "MMULU COMPANY");
    window.localStorage.setItem("vivi.selectedPath", "AFRICA / EAST AFRICA / TRANSFLEET SERVICES / MMULU COMPANY");
    const rows = await loadCms808VehiclesForActiveHierarchy();
    expect(rows).toEqual([]);
    expect(called).toBe(0);
  });
});
