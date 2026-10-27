import { describe, expect, it } from "vitest";
import {
  locationShapeToGpsIotPayload,
  locationShapeToTraccarArea,
  parseTraccarAreaToShape
} from "./locationGeofences";

describe("locationShapeToTraccarArea", () => {
  it("builds a Traccar circle area", () => {
    expect(
      locationShapeToTraccarArea({
        type: "circle",
        center: { lat: -6.7924, lng: 39.2083 },
        radius: 250
      })
    ).toBe("CIRCLE (-6.7924 39.2083, 250)");
  });

  it("closes polygon areas", () => {
    expect(
      locationShapeToTraccarArea({
        type: "polygon",
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
          { lat: 5, lng: 6 }
        ]
      })
    ).toBe("POLYGON ((1 2, 3 4, 5 6, 1 2))");
  });

  it("parses Traccar circle areas", () => {
    expect(parseTraccarAreaToShape("CIRCLE (-6.7924 39.2083, 250)")).toEqual({
      type: "circle",
      center: { lat: -6.7924, lng: 39.2083 },
      radius: 250
    });
  });

  it("parses Traccar polygon areas", () => {
    expect(parseTraccarAreaToShape("POLYGON ((1 2, 3 4, 5 6, 1 2))")).toEqual({
      type: "polygon",
      points: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
        { lat: 5, lng: 6 }
      ]
    });
  });

  it("rejects incomplete polylines", () => {
    expect(() =>
      locationShapeToTraccarArea({
        type: "polyline",
        points: [{ lat: 1, lng: 2 }]
      })
    ).toThrow(/at least two points/i);
  });

  it("maps rectangle to GPS IoT polygon points for CreatePolygonGeofence", () => {
    expect(
      locationShapeToGpsIotPayload({
        type: "rectangle",
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 }
        ]
      })
    ).toEqual({
      type: "polygon",
      points: [
        { lat: 1, lng: 2 },
        { lat: 1, lng: 4 },
        { lat: 3, lng: 4 },
        { lat: 3, lng: 2 }
      ]
    });
  });
});
