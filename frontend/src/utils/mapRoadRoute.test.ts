import { describe, expect, it } from "vitest";
import { formatMeasureDistance, parseOsrmRouteResponse, polylineLengthMeters } from "./mapRoadRoute";

describe("mapRoadRoute", () => {
  it("formats short distances in meters", () => {
    expect(formatMeasureDistance(450)).toBe("450 m");
  });

  it("formats long distances in kilometers", () => {
    expect(formatMeasureDistance(2540)).toBe("2.54 km");
  });

  it("sums polyline segment lengths", () => {
    const meters = polylineLengthMeters([
      { lat: -26.2041, lng: 28.0473 },
      { lat: -26.1952, lng: 28.0614 }
    ]);
    expect(meters).toBeGreaterThan(1000);
    expect(meters).toBeLessThan(2500);
  });

  it("parses OSRM route geometry", () => {
    const parsed = parseOsrmRouteResponse({
      code: "Ok",
      routes: [
        {
          distance: 146,
          geometry: {
            coordinates: [
              [32.450207, 0.419937],
              [32.450664, 0.421172]
            ]
          }
        }
      ]
    });
    expect(parsed?.meters).toBe(146);
    expect(parsed?.points).toEqual([
      { lat: 0.419937, lng: 32.450207 },
      { lat: 0.421172, lng: 32.450664 }
    ]);
  });
});
