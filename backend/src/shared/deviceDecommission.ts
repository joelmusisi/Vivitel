/**
 * Remove an installed device (IMEI) from operational storage while keeping the asset
 * record and B2 archives under the asset storage prefix.
 */

export type TraccarFetchResult = { ok: boolean; status: number; body: unknown };

export type TraccarFetchFn = (
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<TraccarFetchResult>;

const DEVICE_TRACE_FIELDS = [
  "imei",
  "device",
  "mobileModel",
  "firmware",
  "imsi",
  "msisdn",
  "mobileDevice",
  "standaloneMode",
  "hasCamera",
  "camera",
  "cameraModel",
  "cameraComponents",
  "cameraPositioningProtocol",
  "cameraVideoProtocol",
  "cameraSerial",
  "cameraStatus",
  "cameraFirmware",
  "cameraChannelsSelected",
  "selectedChannels",
  "selectedChannelsCount",
  "channelCount",
  "traccarDeviceId",
  "traccarGroupId",
  "lastPosition",
  "lastTrip",
  "lastLocation",
  "lastSeen",
  "anchorLat",
  "anchorLng",
  "anchorRadiusMeters",
  "anchorName",
  "configUploadDate"
] as const;

export function buildAssetAfterDeviceDecommission(
  existing: Record<string, unknown>,
  decommissionedAt: string
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  for (const field of DEVICE_TRACE_FIELDS) {
    delete next[field];
  }
  next.imei = "";
  next.assetStatus = "Decommissioned";
  next.status = "unavailable";
  next.deviceDecommissionedAt = decommissionedAt;
  return next;
}

export async function deleteTraccarDeviceByImei(
  traccarFetch: TraccarFetchFn,
  imei: string
): Promise<{ removed: boolean; skipped?: boolean; error?: string }> {
  const needle = String(imei ?? "").trim();
  if (!needle) return { removed: false, error: "imei is required" };

  const findDevice = async () => {
    const byUnique = await traccarFetch(`/api/devices?uniqueId=${encodeURIComponent(needle)}`);
    if (byUnique.ok && Array.isArray(byUnique.body)) {
      const list = byUnique.body as Record<string, unknown>[];
      const match =
        list.find((row) => String((row as any)?.uniqueId ?? "").trim() === needle) ?? list[0] ?? null;
      if (match) return { device: match, listError: null as string | null };
    }
    const allResp = await traccarFetch("/api/devices?all=true");
    if (!allResp.ok) {
      return {
        device: null,
        listError: String((allResp.body as any)?.message ?? (allResp.body as any)?.error ?? `HTTP ${allResp.status}`)
      };
    }
    const devices = Array.isArray(allResp.body) ? (allResp.body as Record<string, unknown>[]) : [];
    const match = devices.find((row) => String((row as any)?.uniqueId ?? "").trim() === needle) ?? null;
    return { device: match, listError: null as string | null };
  };

  const { device, listError } = await findDevice();
  if (listError) return { removed: false, error: listError };
  if (!device) return { removed: false, skipped: true, error: "Traccar device not found for IMEI" };

  const traccarId = Number((device as any)?.id ?? 0);
  if (!Number.isFinite(traccarId) || traccarId <= 0) {
    return { removed: false, error: "Invalid Traccar device id" };
  }

  const delResp = await traccarFetch(`/api/devices/${traccarId}`, { method: "DELETE" });
  if (delResp.ok || delResp.status === 404) return { removed: true };
  return {
    removed: false,
    error: String((delResp.body as any)?.message ?? (delResp.body as any)?.error ?? `DELETE HTTP ${delResp.status}`)
  };
}

export type OperationalPurgeCounts = {
  telemetry: number;
  pushQueue: number;
  deviceSyncJobs: number;
  cameraHealth: number;
  cameraAudioChunks: number;
  talkbackQueue: number;
  traccarOutbox: number;
};

export type DeviceDecommissionResponse = {
  asset: Record<string, unknown>;
  traccar: { removed: boolean; skipped?: boolean; error?: string };
  purged: OperationalPurgeCounts;
  traccarDeleteQueued?: boolean;
};

const emptyPurgeCounts = (): OperationalPurgeCounts => ({
  telemetry: 0,
  pushQueue: 0,
  deviceSyncJobs: 0,
  cameraHealth: 0,
  cameraAudioChunks: 0,
  talkbackQueue: 0,
  traccarOutbox: 0
});

function purgeCameraScopedRows(
  db: {
    prepare: (sql: string) => {
      run: (...params: unknown[]) => { changes?: number };
    };
  },
  tenant: string,
  cameraIds: Set<string>,
  counts: OperationalPurgeCounts
) {
  for (const cameraId of cameraIds) {
    try {
      counts.cameraHealth += Number(
        db.prepare("DELETE FROM camera_health WHERE tenant_id = ? AND camera_id = ?").run(tenant, cameraId).changes ?? 0
      );
    } catch {
      // ignore
    }
    try {
      counts.cameraAudioChunks += Number(
        db
          .prepare("DELETE FROM camera_audio_chunks WHERE tenant_id = ? AND camera_id = ?")
          .run(tenant, cameraId).changes ?? 0
      );
    } catch {
      // ignore
    }
    try {
      counts.talkbackQueue += Number(
        db
          .prepare("DELETE FROM talkback_queue WHERE tenant_id = ? AND camera_id = ?")
          .run(tenant, cameraId).changes ?? 0
      );
    } catch {
      // ignore
    }
  }
}

/** Remove hot operational rows for a device IMEI (does not touch B2). */
export function purgeOperationalDeviceTraces(
  db: {
    prepare: (sql: string) => {
      run: (...params: unknown[]) => { changes?: number };
    };
  },
  tenantId: string,
  imei: string,
  assetId: string,
  extraCameraIds: string[] = []
): OperationalPurgeCounts {
  const tenant = String(tenantId ?? "").trim();
  const needle = String(imei ?? "").trim();
  const asset = String(assetId ?? "").trim();
  const counts = emptyPurgeCounts();
  if (!tenant || !needle) return counts;

  try {
    counts.telemetry = Number(
      db
        .prepare(
          "DELETE FROM telemetry_events WHERE tenant_id = ? AND (imei = ? OR asset_id = ?)"
        )
        .run(tenant, needle, asset || needle).changes ?? 0
    );
  } catch {
    // table may be absent in some runtimes
  }

  try {
    counts.pushQueue = Number(
      db.prepare("DELETE FROM device_push_queue WHERE tenant_id = ? AND imei = ?").run(tenant, needle).changes ?? 0
    );
  } catch {
    // ignore
  }

  try {
    counts.deviceSyncJobs += Number(
      db.prepare("DELETE FROM device_sync_jobs WHERE tenant_id = ? AND asset_id = ?").run(tenant, asset || needle)
        .changes ?? 0
    );
  } catch {
    // worker D1 only
  }

  try {
    counts.deviceSyncJobs += Number(
      db
        .prepare("DELETE FROM device_sync_jobs WHERE tenant_id = ? AND payload LIKE ?")
        .run(tenant, `%\"imei\":\"${needle}\"%`).changes ?? 0
    );
  } catch {
    // ignore
  }

  const cameraIds = new Set<string>([needle, ...extraCameraIds.map((id) => String(id ?? "").trim()).filter(Boolean)]);
  purgeCameraScopedRows(db, tenant, cameraIds, counts);

  try {
    counts.traccarOutbox = Number(
      db
        .prepare(
          "DELETE FROM traccar_outbox WHERE tenant_id = ? AND (payload LIKE ? OR payload LIKE ?)"
        )
        .run(tenant, `%\"imei\":\"${needle}\"%`, `%\"uniqueId\":\"${needle}\"%`).changes ?? 0
    );
  } catch {
    // ignore
  }

  return counts;
}

type D1Runner = {
  prepare: (sql: string) => {
    bind: (...params: unknown[]) => {
      run: () => Promise<{ meta?: { changes?: number } }>;
    };
  };
};

/** Cloudflare D1 purge (same semantics as VPS SQLite purge). */
export async function purgeD1OperationalDeviceTraces(
  d1: D1Runner,
  tenantId: string,
  imei: string,
  assetId: string,
  extraCameraIds: string[] = []
): Promise<OperationalPurgeCounts> {
  const tenant = String(tenantId ?? "").trim();
  const needle = String(imei ?? "").trim();
  const asset = String(assetId ?? "").trim();
  const counts = emptyPurgeCounts();
  if (!tenant || !needle) return counts;

  const runDelete = async (sql: string, ...binds: unknown[]) => {
    try {
      const result = await d1.prepare(sql).bind(...binds).run();
      return Number(result.meta?.changes ?? 0);
    } catch {
      return 0;
    }
  };

  counts.telemetry = await runDelete(
    "DELETE FROM telemetry_events WHERE tenant_id = ?1 AND (imei = ?2 OR asset_id = ?3)",
    tenant,
    needle,
    asset || needle
  );
  counts.pushQueue = await runDelete(
    "DELETE FROM device_push_queue WHERE tenant_id = ?1 AND imei = ?2",
    tenant,
    needle
  );
  if (asset) {
    counts.deviceSyncJobs += await runDelete(
      "DELETE FROM device_sync_jobs WHERE tenant_id = ?1 AND asset_id = ?2",
      tenant,
      asset
    );
  }
  counts.deviceSyncJobs += await runDelete(
    "DELETE FROM device_sync_jobs WHERE tenant_id = ?1 AND payload LIKE ?2",
    tenant,
    `%\"imei\":\"${needle}\"%`
  );
  counts.traccarOutbox = await runDelete(
    "DELETE FROM traccar_outbox WHERE tenant_id = ?1 AND (payload LIKE ?2 OR payload LIKE ?3)",
    tenant,
    `%\"imei\":\"${needle}\"%`,
    `%\"uniqueId\":\"${needle}\"%`
  );

  const cameraIds = new Set<string>([needle, ...extraCameraIds.map((id) => String(id ?? "").trim()).filter(Boolean)]);
  for (const cameraId of cameraIds) {
    counts.cameraHealth += await runDelete(
      "DELETE FROM camera_health WHERE tenant_id = ?1 AND camera_id = ?2",
      tenant,
      cameraId
    );
    counts.cameraAudioChunks += await runDelete(
      "DELETE FROM camera_audio_chunks WHERE tenant_id = ?1 AND camera_id = ?2",
      tenant,
      cameraId
    );
    counts.talkbackQueue += await runDelete(
      "DELETE FROM talkback_queue WHERE tenant_id = ?1 AND camera_id = ?2",
      tenant,
      cameraId
    );
  }

  return counts;
}

export async function completeDeviceDecommission(params: {
  asset: Record<string, unknown>;
  assetId: string;
  imei: string;
  removeTraccarDevice: (imei: string) => Promise<{ removed: boolean; skipped?: boolean; error?: string }>;
  purgeOperationalTraces: (
    imei: string,
    assetId: string,
    cameraSerial: string
  ) => Promise<OperationalPurgeCounts>;
  persistDecommissionedAsset: (
    assetId: string,
    nextAsset: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
}): Promise<DeviceDecommissionResponse> {
  const imei = String(params.imei ?? "").trim();
  const assetId = String(params.assetId ?? "").trim();
  if (!imei || !assetId) {
    throw new Error("imei and assetId are required for decommission.");
  }

  const cameraSerial = String(params.asset.cameraSerial ?? "").trim();
  const traccar = await params.removeTraccarDevice(imei);
  const purged = await params.purgeOperationalTraces(imei, assetId, cameraSerial);
  const decommissionedAt = new Date().toISOString();
  const nextAsset = buildAssetAfterDeviceDecommission({ ...params.asset, id: assetId }, decommissionedAt);
  const asset = await params.persistDecommissionedAsset(assetId, nextAsset);

  const persistedImei = String((asset as any).imei ?? "").trim();
  if (persistedImei) {
    throw new Error("Decommission failed to persist cleared IMEI on the asset record.");
  }

  return { asset, traccar, purged };
}
