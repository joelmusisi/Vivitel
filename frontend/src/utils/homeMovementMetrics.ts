import { getTraccarTrips } from "./api";

import type { HomeDayPoint } from "./homeDashboardApi";

import { loadScopedDeviceContext } from "./homeScopedDevices";

import { buildHomeTimeline, homeTimelineBucketKey } from "./homeTimeline";



/** Same distance rule as detailed movement reports (trip distance in metres -> km). */

const tripDistanceKm = (trip: { distance?: unknown }) => {

  const numeric = Number(trip.distance ?? 0);

  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  return numeric >= 1000 ? numeric / 1000 : numeric;

};



export type HomeMovementDistance = {

  totalDistanceKm: number;

  distanceSeries: HomeDayPoint[];

};



/** Distance totals from Traccar trip reports (detailed movement report source). */

export async function fetchHomeDistanceFromMovementReports(

  fromDate: string,

  toDate: string

): Promise<HomeMovementDistance> {

  const from = new Date(`${fromDate}T00:00:00`).toISOString();

  const to = new Date(`${toDate}T23:59:59.999`).toISOString();

  const { buckets, bucketIndexByKey, mode } = buildHomeTimeline(fromDate, toDate);



  const { deviceIds } = await loadScopedDeviceContext();

  if (!deviceIds.length) {

    return { totalDistanceKm: 0, distanceSeries: buckets };

  }



  const tripBatches = await Promise.all(

    deviceIds.map((deviceId) => getTraccarTrips({ from, to, deviceId }).catch(() => []))

  );



  let totalDistanceKm = 0;

  for (const trips of tripBatches) {

    for (const trip of trips) {

      const distanceKm = tripDistanceKm(trip);

      totalDistanceKm += distanceKm;

      const startMs = Date.parse(String(trip.startTime ?? ""));

      if (!Number.isFinite(startMs)) continue;

      const idx = bucketIndexByKey.get(homeTimelineBucketKey(new Date(startMs), mode));

      if (idx != null) buckets[idx].value += distanceKm;

    }

  }



  return {

    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,

    distanceSeries: buckets.map((bucket) => ({

      label: bucket.label,

      value: Math.round(bucket.value * 10) / 10

    }))

  };

}

