import { describe, expect, it } from "vitest";
import { compareSortValues, sortRowsByColumn, toggleSortState } from "./tableSort";

describe("compareSortValues", () => {
  it("compares text case-insensitively", () => {
    expect(compareSortValues("apple", "Banana")).toBeLessThan(0);
    expect(compareSortValues("Banana", "apple")).toBeGreaterThan(0);
  });

  it("compares numbers numerically", () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    expect(compareSortValues("10", "2")).toBeGreaterThan(0);
  });

  it("compares iso dates chronologically", () => {
    expect(compareSortValues("2026-01-01", "2026-02-01")).toBeLessThan(0);
  });

  it("pushes empty values to the end", () => {
    expect(compareSortValues("", "a")).toBeGreaterThan(0);
    expect(compareSortValues("a", null)).toBeLessThan(0);
  });
});

describe("toggleSortState", () => {
  it("starts ascending on a new column", () => {
    expect(toggleSortState(null, "name")).toEqual({ key: "name", direction: "asc" });
  });

  it("toggles asc to desc on the same column", () => {
    expect(toggleSortState({ key: "name", direction: "asc" }, "name")).toEqual({
      key: "name",
      direction: "desc"
    });
  });

  it("resets to ascending when switching columns", () => {
    expect(toggleSortState({ key: "name", direction: "desc" }, "type")).toEqual({
      key: "type",
      direction: "asc"
    });
  });
});

describe("sortRowsByColumn", () => {
  const rows = [
    { name: "Charlie", speed: 20 },
    { name: "Alpha", speed: 80 },
    { name: "Bravo", speed: 45 }
  ];

  it("sorts ascending by text", () => {
    const sorted = sortRowsByColumn(rows, { key: "name", direction: "asc" }, (row, key) => row[key as "name"]);
    expect(sorted.map((row) => row.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts descending by number", () => {
    const sorted = sortRowsByColumn(rows, { key: "speed", direction: "desc" }, (row, key) => row[key as "speed"]);
    expect(sorted.map((row) => row.speed)).toEqual([80, 45, 20]);
  });

  it("returns original order when sort is null", () => {
    expect(sortRowsByColumn(rows, null, (row) => row.name)).toEqual(rows);
  });
});
