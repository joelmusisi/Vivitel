import { getTraccarTrips } from "./api";

import type { HomeDayPoint, HomeRankRow } from "./homeDashboardApi";

import { loadScopedDeviceContext } from "./homeScopedDevices";

import { buildHomeTimeline, homeTimelineBucketKey } from "./homeTimeline";



const assetLabel = (asset: Record<string, unknown>) =>

  String(asset.registration ?? asset.assetDescription ?? asset.name ?? "Asset").trim();



export type HomeStandingMetrics = {

  standingMs: number;

  drivingMs: number;

  standingPct: number;

  standingSeries: HomeDayPoint[];

  topStandingAssets: HomeRankRow[];

};



/** Standing time from detailed movement report trip-gap logic. */

export async function fetchHomeStandingFromMovementReport(

  fromDate: string,

  toDate: string

): Promise<HomeStandingMetrics> {

  const from = new Date(`${fromDate}T00:00:00`).toISOString();

  const to = new Date(`${toDate}T23:59:59.999`).toISOString();

  const { buckets, bucketIndexByKey, mode } = buildHomeTimeline(fromDate, toDate);



  const { deviceIds, assetByDeviceId } = await loadScopedDeviceContext();

  if (!deviceIds.length) {

    return {

      standingMs: 0,

      drivingMs: 0,

      standingPct: 0,

      standingSeries: buckets,

      topStandingAssets: []

    };

  }



  let totalStandingMs = 0;

  let totalDrivingMs = 0;

  const standingByAsset = new Map<string, number>();



  const tripBatches = await Promise.all(

    deviceIds.map((deviceId) => getTraccarTrips({ from, to, deviceId }).catch(() => []))

  );



  for (let batchIndex = 0; batchIndex < tripBatches.length; batchIndex += 1) {

    const deviceId = deviceIds[batchIndex];

    const asset = assetByDeviceId.get(deviceId);

    const label = asset ? assetLabel(asset) : `Device ${deviceId}`;

    const sortedTrips = [...tripBatches[batchIndex]].sort(

      (a, b) => Date.parse(String(a.startTime ?? "")) - Date.parse(String(b.startTime ?? ""))

    );



    let assetStandingMs = 0;

    for (let index = 0; index < sortedTrips.length; index += 1) {

      const trip = sortedTrips[index];

      const startTime = new Date(String(trip.startTime ?? ""));

      const endTime = new Date(String(trip.endTime ?? ""));

      const nextTrip = sortedTrips[index + 1];

      const nextStart = nextTrip ? new Date(String(nextTrip.startTime ?? "")) : null;



      const durationMs = Number.isFinite(Number(trip.duration)) && Number(trip.duration) > 0

        ? Number(trip.duration)

        : Math.max(0, endTime.getTime() - startTime.getTime());

      const standingMs = nextStart && Number.isFinite(endTime.getTime()) && nextStart.getTime() > endTime.getTime()

        ? nextStart.getTime() - endTime.getTime()

        : 0;



      totalDrivingMs += durationMs;

      totalStandingMs += standingMs;

      assetStandingMs += standingMs;



      if (standingMs > 0 && Number.isFinite(endTime.getTime())) {

        const idx = bucketIndexByKey.get(homeTimelineBucketKey(endTime, mode));

        if (idx != null) buckets[idx].value += standingMs / 3_600_000;

      }

    }



    if (assetStandingMs > 0) {

      standingByAsset.set(label, (standingByAsset.get(label) ?? 0) + assetStandingMs);

    }

  }



  const totalMs = totalStandingMs + totalDrivingMs;

  const standingPct = totalMs > 0 ? Math.round((totalStandingMs / totalMs) * 1000) / 10 : 0;

  const maxStanding = Math.max(...standingByAsset.values(), 1);

  const topStandingAssets: HomeRankRow[] = [...standingByAsset.entries()]

    .sort((a, b) => b[1] - a[1])

    .slice(0, 10)

    .map(([name, value]) => ({

      name,

      sub: "Standing time",

      value: Math.round((value / 3_600_000) * 10) / 10,

      ratio: value / maxStanding

    }));



  return {

    standingMs: totalStandingMs,

    drivingMs: totalDrivingMs,

    standingPct,

    standingSeries: buckets.map((bucket) => ({

      label: bucket.label,

      value: Math.round(bucket.value * 10) / 10

    })),

    topStandingAssets

  };

}

