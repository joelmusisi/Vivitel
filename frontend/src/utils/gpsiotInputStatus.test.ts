import { describe, expect, it } from "vitest";
import { formatGpsIotInputStatusLabel, sortGpsIotInputs } from "./gpsiotInputStatus";

describe("gpsiotInputStatus helpers", () => {
  it("formats High/Low labels and sorts digital before analogue", () => {
    const sorted = sortGpsIotInputs([
      { name: "AIN 1", status: "2830", value: 2830, kind: "analogue" },
      { name: "Input 2", status: "Low", value: 0, kind: "digital" },
      { name: "Input 1", status: "High", value: 1, kind: "digital" }
    ]);
    expect(sorted.map((row) => row.name)).toEqual(["Input 1", "Input 2", "AIN 1"]);
    expect(formatGpsIotInputStatusLabel(sorted[0]!)).toBe("High");
    expect(formatGpsIotInputStatusLabel({ name: "X", status: "", value: 12.5, kind: "analogue" })).toBe("12.5");
  });
});
