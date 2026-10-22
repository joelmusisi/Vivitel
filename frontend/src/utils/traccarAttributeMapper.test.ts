import { describe, expect, it } from "vitest";
import {
  buildComputedAttributeExpressionFromLibrary,
  buildOverSpeedExcessJexlExpression,
  resolveExpressionParameterName,
  usesOverSpeedExcessCapture
} from "./traccarAttributeMapper";

describe("buildComputedAttributeExpressionFromLibrary", () => {
  it("uses return parameter for threshold expression instead of stale fuelLevel", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Engine overspeed",
        type: "Notification",
        parameters: {
          returnValue: { param: "RPM", mode: "Maximum" },
          conditions: [{ id: 1, field: "fuelLevel", operator: "<=", value: "3000" }]
        }
      },
      [{ name: "RPM", type: "Value", availability: "Available" }]
    );
    expect(expression).not.toContain("fuelLevel");
    expect(expression).toContain("RPM");
  });

  it("builds condition expression from catalog parameter name", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Custom alert",
        type: "Notification",
        parameters: {
          returnValue: { param: "No return value", mode: "Maximum" },
          conditions: [{ id: 1, field: "RPM", operator: ">", value: "4000" }]
        }
      },
      [{ name: "RPM", type: "Value", availability: "Available" }]
    );
    expect(expression).toContain("RPM");
    expect(expression).not.toContain("fuelLevel");
  });

  it("joins multiple conditions with and/or from each row", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Harsh cornering while driving",
        type: "Notification",
        parameters: {
          returnValue: { param: "No return value", mode: "Maximum" },
          conditions: [
            { id: 1, field: "Ignition", operator: "=", value: "true", join: "and" },
            { id: 2, field: "3-Axis Cornering G-Force (High Sensitivity)", operator: ">", value: "0.5" }
          ]
        }
      },
      [
        { name: "Ignition", type: "Boolean", availability: "Available" },
        { name: "3-Axis Cornering G-Force (High Sensitivity)", type: "Value", availability: "Available" }
      ]
    );
    expect(expression).toContain("&&");
    expect(expression).toContain("0.5");
  });

  it("maps Ignition on catalog boolean to Traccar ignition == true", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Ignition on",
        type: "Notification",
        parameters: {
          returnValue: { param: "No return value", mode: "Maximum" },
          conditions: [{ id: 1, field: "Ignition on", operator: "is", value: "true" }]
        }
      },
      [{ name: "Ignition on", type: "Boolean", availability: "Available" }]
    );
    expect(expression).toBe("ignition == true");
  });

  it("maps Vehicle moving boolean to Traccar motion", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Device moving",
        type: "Notification",
        parameters: {
          returnValue: { param: "No return value", mode: "Maximum" },
          conditions: [{ id: 1, field: "Vehicle moving", operator: "is", value: "true" }]
        }
      },
      [{ name: "Vehicle moving", type: "Boolean", availability: "Available" }]
    );
    expect(expression).toBe("motion == true");
  });

  it("supports or between conditions", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Multi condition or",
        type: "Notification",
        parameters: {
          returnValue: { param: "No return value", mode: "Maximum" },
          conditions: [
            { id: 1, field: "RPM", operator: ">", value: "4000", join: "or" },
            { id: 2, field: "Speed", operator: ">", value: "80" }
          ]
        }
      },
      [
        { name: "RPM", type: "Value", availability: "Available" },
        { name: "Speed", type: "Speed", availability: "Available" }
      ]
    );
    expect(expression).toContain("||");
  });

  it("compares Road speed thresholds in km/h against Traccar knots", () => {
    const expression = buildComputedAttributeExpressionFromLibrary(
      {
        description: "Mulu Over Speeding",
        type: "Custom",
        parameters: {
          returnValue: { param: "Road speed", mode: "Maximum" },
          conditions: [{ id: 1, field: "Road speed", operator: ">", value: "80" }]
        }
      }
    );
    expect(usesOverSpeedExcessCapture("Mulu Over Speeding")).toBe(false);
    expect(expression).toContain("(speed * 1.852) > 80");
    expect(expression).not.toContain("speed > 80");
  });

  it("builds overspeed excess in km/h from a knots position speed", () => {
    const expression = buildOverSpeedExcessJexlExpression([
      { id: 1, field: "Speed", operator: ">", value: "80" }
    ]);
    expect(expression).toContain("maxSpeedKph = 80");
    expect(expression).toContain("speed * 1.852");
    expect(expression).toContain("speedKph - maxSpeedKph");
  });
});

describe("resolveExpressionParameterName", () => {
  it("replaces legacy fuelLevel when event is not fuel-related", () => {
    const name = resolveExpressionParameterName(
      "fuelLevel",
      {
        description: "Panic Alert",
        parameters: {
          returnValue: { param: "Panic Alert", mode: "Maximum" },
          conditions: [{ id: 1, field: "fuelLevel", operator: "=", value: "true" }]
        }
      },
      [{ name: "Panic Alert", type: "Boolean", availability: "Available" }]
    );
    expect(name).toBe("Panic Alert");
  });
});
