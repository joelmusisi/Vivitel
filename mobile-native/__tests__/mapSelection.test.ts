import type { LiveMapMarker } from "../src/api/liveTracking";
import { cameraTargetAfterLoad } from "../src/utils/mapSelection";

const marker = (id: string, lat = 0.3, lng = 32.5): LiveMapMarker => ({
  id,
  label: id,
  subtitle: "",
  lat,
  lng,
  status: "online"
});

describe("live map camera after a refresh", () => {
  const fleet = [marker("a"), marker("b", 0.4, 32.6)];

  test("first load fits the whole fleet", () => {
    expect(cameraTargetAfterLoad(fleet, null, { fitted: false, userMoved: false })).toEqual({ kind: "fit" });
  });

  test("follows the selected asset instead of re-fitting", () => {
    const moved = [marker("a"), marker("b", 0.45, 32.7)];
    expect(cameraTargetAfterLoad(moved, "b", { fitted: true, userMoved: true })).toEqual({
      kind: "follow",
      marker: moved[1]
    });
  });

  test("leaves the map alone once the user has panned or zoomed", () => {
    expect(cameraTargetAfterLoad(fleet, null, { fitted: true, userMoved: true })).toBeNull();
  });

  test("keeps fitting while the user hasn't touched the map", () => {
    expect(cameraTargetAfterLoad(fleet, null, { fitted: true, userMoved: false })).toEqual({ kind: "fit" });
  });

  test("a selected asset that lost its GPS fix falls back to normal behaviour", () => {
    expect(cameraTargetAfterLoad(fleet, "gone", { fitted: true, userMoved: true })).toBeNull();
  });

  test("no markers, no camera move", () => {
    expect(cameraTargetAfterLoad([], "a", { fitted: false, userMoved: false })).toBeNull();
  });
});
