import { describe, expect, it } from "vitest";
import {
  activeOnlyFuelNotificationDescriptions,
  applyActiveOnlyFuelParametersForSave,
  isActiveOnlyFuelNotificationDescription,
  isFuelTankComputationNotificationDescription,
  normalizeNotificationLibraryRow,
  notificationRows,
  notificationUsesFuelTankComputation,
  stripMisplacedFuelComputeParameters
} from "./notificationLibrary";

describe("active-only fuel library events", () => {
  it("numbers every library row from 1 with no gaps", () => {
    expect(notificationRows.map((row) => row.eventId)).toEqual(
      notificationRows.map((_, index) => String(index + 1))
    );
  });

  it("includes the four default fuel events", () => {
    const descriptions = notificationRows.map((row) => row.description);
    for (const name of activeOnlyFuelNotificationDescriptions) {
      expect(descriptions).toContain(name);
    }
  });

  it("locks parameters to empty conditions", () => {
    const row = normalizeNotificationLibraryRow({
      description: "Fuel Siphoning",
      type: "Default",
      availability: "Available",
      parameters: {
        conditions: [{ id: 1, field: "Speed", operator: ">", value: "99" }],
        returnValue: { param: "Speed", mode: "Maximum" },
        active: { enabled: true }
      }
    });
    expect(row).not.toBeNull();
    expect(isActiveOnlyFuelNotificationDescription(row!.description)).toBe(true);
    expect(row!.parameters?.conditions).toEqual([]);
    expect(row!.parameters?.returnValue?.param).toBe("No return value");
    expect(row!.parameters?.active?.enabled).toBe(true);
  });

  it("applyActiveOnlyFuelParametersForSave strips custom conditions", () => {
    const params = applyActiveOnlyFuelParametersForSave({
      active: { enabled: true, queueMode: "immediate" }
    });
    expect(params.conditions).toEqual([]);
    expect((params as any).fuelCompute).toBeUndefined();
  });
});

describe("fuel tank computation scope", () => {
  it("allows only Fuel level (computed) and Fuel in tank descriptions", () => {
    expect(isFuelTankComputationNotificationDescription("Fuel level (computed)")).toBe(true);
    expect(isFuelTankComputationNotificationDescription("Fuel in tank")).toBe(true);
    expect(isFuelTankComputationNotificationDescription("Fuel Siphoning")).toBe(false);
    expect(isFuelTankComputationNotificationDescription("Fuel drop")).toBe(false);
    expect(isFuelTankComputationNotificationDescription("Ignition on")).toBe(false);
    expect(isFuelTankComputationNotificationDescription("Panic Alert")).toBe(false);
  });

  it("does not treat leftover fuelCompute on other events as fuel computation", () => {
    expect(
      notificationUsesFuelTankComputation({
        description: "Ignition on",
        type: "User",
        availability: "Available",
        parameters: {
          fuelCompute: { enabled: true, tankCapacity: "400", scale: "75", outputAttribute: "fuelLevel" },
          returnValue: { param: "Fuel tank computation", mode: "Maximum" },
          conditions: [{ id: 1, field: "Fuel tank computation", operator: ">=", value: "0" }]
        }
      })
    ).toBe(false);
  });

  it("strips fuelCompute and fuel-tank parameter refs from non-fuel events", () => {
    const stripped = stripMisplacedFuelComputeParameters({
      description: "Ignition on",
      type: "User",
      availability: "Available",
      parameters: {
        fuelCompute: { enabled: true, tankCapacity: "400", scale: "75" },
        returnValue: { param: "Fuel tank computation", mode: "Maximum" },
        conditions: [
          { id: 1, field: "Fuel tank computation", operator: ">=", value: "0" },
          { id: 2, field: "Ignition", operator: "is", value: "true" }
        ]
      }
    });
    expect(stripped.parameters?.fuelCompute).toBeUndefined();
    expect(stripped.parameters?.returnValue?.param).toBe("No return value");
    expect(stripped.parameters?.conditions).toEqual([
      { id: 2, field: "Ignition", operator: "is", value: "true" }
    ]);
  });

  it("keeps fuelCompute on Fuel level (computed)", () => {
    const row = {
      description: "Fuel level (computed)",
      type: "Computed",
      availability: "Available",
      parameters: {
        fuelCompute: { enabled: true, tankCapacity: "400", scale: "75", outputAttribute: "fuelLevel" }
      }
    };
    expect(notificationUsesFuelTankComputation(row)).toBe(true);
    expect(stripMisplacedFuelComputeParameters(row).parameters?.fuelCompute).toEqual(
      row.parameters.fuelCompute
    );
  });
});
