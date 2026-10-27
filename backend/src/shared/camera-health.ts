import path from "path";
import fs from "fs";
import { parseStoredJson } from "./json";
import { sanitizeCameraId } from "./camera";

// Global state - initialized by vps_server.ts
declare let db: any;
declare let CAMERA_RECORDINGS_DIR: string;

export function ensureRecordingPath(tenantRaw: string, cameraIdRaw: string, recordedAtIso: string) {
  const tenant = sanitizeCameraId(tenantRaw) || "default";
  const cameraId = sanitizeCameraId(cameraIdRaw) || "camera-unknown";
  const yyyyMmDd = recordedAtIso.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dir = path.join(CAMERA_RECORDINGS_DIR, tenant, cameraId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${yyyyMmDd}.pcm`);
  return { tenant, cameraId, filePath };
}

export function upsertCameraHealth(tenant: string, cameraId: string, payload: any, atIso: string) {
  const next = {
    ...(payload ?? {}),
    id: cameraId,
    cameraId,
    tenantId: tenant,
    lastSeenAt: atIso
  };
  db.prepare("INSERT OR REPLACE INTO camera_health (camera_id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)")
    .run(cameraId, tenant || "", JSON.stringify(next), atIso);
  return next;
}

export function listCameraHealth(tenant: string) {
  const rows = db
    .prepare("SELECT camera_id, data, updated_at FROM camera_health WHERE tenant_id = ? ORDER BY updated_at DESC")
    .all(tenant || "");
  return rows
    .map((r: any) => {
      const parsed: any = parseStoredJson(r?.data) || {};
      return {
        ...parsed,
        id: sanitizeCameraId(parsed?.id) || sanitizeCameraId(r?.camera_id) || "camera-unknown",
        cameraId: sanitizeCameraId(parsed?.cameraId) || sanitizeCameraId(r?.camera_id) || "camera-unknown",
        lastSeenAt: String(parsed?.lastSeenAt ?? r?.updated_at ?? "")
      };
    })
    .filter((row: any) => row.cameraId);
}
