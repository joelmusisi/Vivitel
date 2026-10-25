import { describe, expect, it, vi } from "vitest";
import { loadTripsWithDayCache } from "./tripDayCache";

type Trip = { deviceId: string; startTime: string };

const DAY = 86_400_000;

describe("loadTripsWithDayCache", () => {
  it("fetches settled slices once and only re-fetches the open ones", async () => {
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
    // Settled slices come from the cache; only today (and yesterday before 03:00 UTC) go out again.
    const refetched = fetchRange.mock.calls.length - firstCalls;
    expect(refetched).toBeGreaterThanOrEqual(1);
    expect(refetched).toBeLessThanOrEqual(2);
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

  it("retries a failed batch vehicle by vehicle and caches only the ones that loaded", async () => {
    const dayStart = Math.floor(Date.now() / DAY) * DAY;
    const from = new Date(dayStart - 4 * DAY).toISOString();
    const to = new Date(dayStart - 3 * DAY).toISOString();
    const ids = ["a1", "a2", "a3"];
    // Batches time out; single vehicles load, except a3.
    const fetchRange = vi.fn(async (batch: string[]) => (
      batch.length > 1 || batch[0] === "a3"
        ? { ok: false, trips: [] as Trip[] }
        : { ok: true, trips: [{ deviceId: batch[0], startTime: from }] }
    ));
    const first = await loadTripsWithDayCache<Trip>(ids, from, to, "test-d", fetchRange);
    expect(first.ok).toBe(false);
    expect(first.trips.map((trip) => trip.deviceId).sort()).toEqual(["a1", "a2"]);

    fetchRange.mockClear();
    await loadTripsWithDayCache<Trip>(ids, from, to, "test-d", fetchRange);
    expect(fetchRange).toHaveBeenCalledTimes(1);
    expect(fetchRange).toHaveBeenCalledWith(["a3"], expect.any(String), expect.any(String));
  });

  it("passes short ranges straight through", async () => {
    const now = Date.now();
    const fetchRange = vi.fn(async () => ({ ok: true, trips: [] as Trip[] }));
    await loadTripsWithDayCache<Trip>(["1"], new Date(now - 3_600_000).toISOString(), new Date(now).toISOString(), "test-c", fetchRange);
    expect(fetchRange).toHaveBeenCalledTimes(1);
  });
});
