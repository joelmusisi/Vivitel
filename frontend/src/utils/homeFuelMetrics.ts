import { getTraccarRoute, getTraccarSummary } from "./api";

import type { HomeDayPoint } from "./homeDashboardApi";

import { loadScopedDeviceContext } from "./homeScopedDevices";

import { fetchTripsGroupedByDeviceDetailed, mapPool, tripDistanceKm } from "./homeRangeMetrics";

import { buildHomeTimeline, homeRangeBounds, homeTimelineBucketKey } from "./homeTimeline";

import { resolveHomeTimeZone } from "./homeTimeZone";

import { computeTripUsedFuelLitres } from "./traccarFuel";



const SUMMARY_CONCURRENCY = 6;



const tankCapacityForAsset = (asset: Record<string, unknown>) => {

  const tankCapacity = Number(asset.fuelTankCapacity ?? 0);

  return Number.isFinite(tankCapacity) && tankCapacity > 0 ? tankCapacity : undefined;

};



export type HomeComparativeFuel = {

  totalFuelL: number;

  fuelSeries: HomeDayPoint[];

  idleMs: number;

  /** Vehicles whose summary or trips did not load; fuel excludes them. */

  failedDevices: number;

};



/**
 * Spread one vehicle's fuel over its trips so the chart adds up to the total:
 * by each trip's own litres when trips report fuel, otherwise by distance.
 */
export function distributeDeviceFuel(

  deviceFuelL: number,

  trips: Array<{ startMs: number; fuelL: number; distanceKm: number }>

): Array<{ startMs: number; fuelL: number }> {

  if (deviceFuelL <= 0 || !trips.length) return [];

  const fuelSum = trips.reduce((sum, trip) => sum + Math.max(0, trip.fuelL), 0);

  const distanceSum = trips.reduce((sum, trip) => sum + Math.max(0, trip.distanceKm), 0);

  return trips.map((trip) => {

    const share =

      fuelSum > 0

        ? Math.max(0, trip.fuelL) / fuelSum

        : distanceSum > 0

          ? Math.max(0, trip.distanceKm) / distanceSum

          : 1 / trips.length;

    return { startMs: trip.startMs, fuelL: deviceFuelL * share };

  });

}



/** Fuel totals from comparative fuel report logic (summary + route fuel computation). */

export async function fetchHomeFuelFromComparativeReport(

  fromDate: string,

  toDate: string

): Promise<HomeComparativeFuel> {

  const { buckets, bucketIndexByKey, mode } = buildHomeTimeline(fromDate, toDate);

  const [{ deviceIds, assetByDeviceId }, timeZone] = await Promise.all([

    loadScopedDeviceContext(),

    resolveHomeTimeZone()

  ]);

  if (!deviceIds.length) {

    return { totalFuelL: 0, fuelSeries: buckets, idleMs: 0, failedDevices: 0 };

  }

  const { from, to, startMs, endMs } = homeRangeBounds(fromDate, toDate, timeZone);

  const bucketFor = (ms: number) =>

    Number.isFinite(ms) ? bucketIndexByKey.get(homeTimelineBucketKey(new Date(ms), mode, timeZone)) : undefined;



  let totalFuelL = 0;

  let idleMs = 0;

  const { grouped: tripsByDevice, failedDeviceIds } = await fetchTripsGroupedByDeviceDetailed(deviceIds, from, to);

  const failed = new Set(failedDeviceIds);



  await mapPool(deviceIds, SUMMARY_CONCURRENCY, async (deviceId) => {

    const asset = assetByDeviceId.get(deviceId);

    const trips = tripsByDevice.get(deviceId) ?? [];

    let summaries: Awaited<ReturnType<typeof getTraccarSummary>> = [];

    try {

      summaries = await getTraccarSummary({ from, to, deviceId });

    } catch {

      failed.add(deviceId);

    }

    const summary = summaries[0];

    const summarySpent = Number(summary?.spentFuel ?? 0);

    const tripSpent = trips.reduce((sum, trip) => sum + Math.max(0, Number(trip.spentFuel ?? 0) || 0), 0);

    const summaryDistanceKm = tripDistanceKm({ distance: summary?.distance });

    const tripDistanceKmTotal = trips.reduce((sum, trip) => sum + tripDistanceKm(trip), 0);



    // Route points are the heavy comparative-fuel source. Only pull them when
    // the summary and trips did not already report litres.
    const route =

      summarySpent > 0 || tripSpent > 0 || (summaryDistanceKm <= 0 && tripDistanceKmTotal <= 0)

        ? []

        : await getTraccarRoute({ from, to, deviceId, allowPositionsFallback: false }).catch(() => []);



    const tankCapacityLiters = asset ? tankCapacityForAsset(asset) : undefined;

    const usedFuel = computeTripUsedFuelLitres({

      spentFuel: summary?.spentFuel,

      routePoints: route,

      startMs,

      endMs,

      distanceKm: summaryDistanceKm || tripDistanceKmTotal,

      tankCapacityLiters

    });



    const tripFuels = trips.map((trip) => {

      const tripStartMs = Date.parse(String(trip.startTime ?? ""));

      const tripEndMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));

      const distanceKm = tripDistanceKm(trip);

      return {

        startMs: tripStartMs,

        distanceKm,

        fuelL: computeTripUsedFuelLitres({

          spentFuel: trip.spentFuel,

          routePoints: route,

          startMs: tripStartMs,

          endMs: tripEndMs,

          distanceKm,

          tankCapacityLiters

        })

      };

    });

    const tripFuelSum = tripFuels.reduce((sum, trip) => sum + trip.fuelL, 0);



    // The range summary is the total of record (it includes fuel burnt between
    // trips); trip litres only shape the chart. Either way the chart sums to it.
    const deviceFuelL = usedFuel > 0 ? usedFuel : tripFuelSum;

    totalFuelL += deviceFuelL;

    const spread = distributeDeviceFuel(deviceFuelL, tripFuels);

    if (spread.length) {

      for (const part of spread) {

        const idx = bucketFor(part.startMs);

        if (idx != null) buckets[idx].value += part.fuelL;

      }

    } else if (deviceFuelL > 0) {

      const idx = bucketFor(startMs);

      if (idx != null) buckets[idx].value += deviceFuelL;

    }



    const engineMs = Math.max(0, Number(summary?.engineHours ?? 0));

    const drivingMs = trips.reduce((sum, trip) => {

      const tripStartMs = Date.parse(String(trip.startTime ?? ""));

      const tripEndMs = Date.parse(String(trip.endTime ?? trip.startTime ?? ""));

      const duration = Number(trip.duration);

      if (Number.isFinite(duration) && duration > 0) return sum + duration;

      if (Number.isFinite(tripStartMs) && Number.isFinite(tripEndMs) && tripEndMs > tripStartMs) {

        return sum + (tripEndMs - tripStartMs);

      }

      return sum;

    }, 0);

    if (engineMs > drivingMs) idleMs += engineMs - drivingMs;

  });



  return {

    totalFuelL: Math.round(totalFuelL * 10) / 10,

    fuelSeries: buckets.map((bucket) => ({

      label: bucket.label,

      value: Math.round(bucket.value * 10) / 10

    })),

    idleMs,

    failedDevices: failed.size

  };

}

