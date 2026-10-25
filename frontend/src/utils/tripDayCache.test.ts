import { describe, expect, it, vi } from "vitest";
import { loadTripsWithDayCache } from "./tripDayCache";

type Trip = { deviceId: string; startTime: string };

const DAY = 86_400_000;

describe("loadTripsWithDayCache", () => {
  it("fetches settled days once and only re-fetches the open edges", async () => {
    const dayStart = Math.floor(Date.now() / DAY) * DAY;
    const from = new Date(dayStart - 5 * DAY + 3 * 3_600_000).toISOString();
    const to = new Date(Date.now()).toISOString();
    const fetchRange = vi.fn(async (ids: string[], fromIso: string) => ({
      ok: true,
      trips: ids.map((id) => ({ deviceId: id, startTime: fromIso }))
    }));

    const first = await loadTripsWithDayCache<Trip>(["1", "2"], from, to, "test-a", fetchRange);
    const firstCalls = fetchRange.mock.calls.length;
    expect(first.ok).toBe(true);
    expect(firstCalls).toBeGreaterThan(2);

    const second = await loadTripsWithDayCache<Trip>(["1", "2"], from, to, "test-a", fetchRange);
    // Settled days come from the cache; only the head and the unsettled tail go out again.
    expect(fetchRange.mock.calls.length - firstCalls).toBe(2);
    expect(second.trips).toHaveLength(first.trips.length);
  });

  it("does not cache a day whose request failed", async () => {
    const dayStart = Math.floor(Date.now() / DAY) * DAY;
    const from = new Date(dayStart - 3 * DAY).toISOString();
    const to = new Date(dayStart - 2 * DAY).toISOString();
    const failing = vi.fn(async () => ({ ok: false, trips: [] as Trip[] }));
    expect((await loadTripsWithDayCache<Trip>(["9"], from, to, "test-b", failing)).ok).toBe(false);

    const working = vi.fn(async (ids: string[]) => ({ ok: true, trips: ids.map((id) => ({ deviceId: id, startTime: from })) }));
    const result = await loadTripsWithDayCache<Trip>(["9"], from, to, "test-b", working);
    expect(working).toHaveBeenCalledTimes(1);
    expect(result.trips).toHaveLength(1);
  });

  it("passes short ranges straight through", async () => {
    const now = Date.now();
    const fetchRange = vi.fn(async () => ({ ok: true, trips: [] as Trip[] }));
    await loadTripsWithDayCache<Trip>(["1"], new Date(now - 3_600_000).toISOString(), new Date(now).toISOString(), "test-c", fetchRange);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });
});
