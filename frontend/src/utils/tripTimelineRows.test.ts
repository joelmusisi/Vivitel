import { describe, expect, it } from "vitest";
import { rangeToMilliseconds, timelineWindowFromAnchor } from "./tripTimelineRows";

describe("timeline windows", () => {
  it("keeps a 24h window on the selected day", () => {
    const anchor = new Date(2026, 9, 8, 0, 0, 0);
    const window = timelineWindowFromAnchor(anchor, "24h");
    expect(window.endMs - window.startMs).toBe(rangeToMilliseconds("24h"));
    expect(new Date(window.startMs).getDate()).toBe(8);
    expect(new Date(window.endMs).getDate()).toBe(9);
  });

  it("looks backward across a month ending on the selected day", () => {
    const anchor = new Date(2026, 9, 8, 0, 0, 0);
    const window = timelineWindowFromAnchor(anchor, "30d");
    expect(window.endMs - window.startMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(new Date(window.endMs).getDate()).toBe(9);
    expect(new Date(window.startMs).getMonth()).toBe(8);
  });
});
