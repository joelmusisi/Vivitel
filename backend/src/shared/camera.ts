import express from "express";

export function sanitizeCameraId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, "")
    .slice(0, 96);
}

export function resolveCameraId(req: express.Request, body?: any) {
  return (
    sanitizeCameraId(body?.cameraId)
    || sanitizeCameraId(body?.deviceId)
    || sanitizeCameraId(body?.id)
    || sanitizeCameraId(body?.imei)
    || sanitizeCameraId(body?.deviceImei)
    || sanitizeCameraId(req.query.cameraId)
    || sanitizeCameraId(req.query.deviceId)
    || sanitizeCameraId(req.query.id)
    || sanitizeCameraId(req.query.imei)
  );
}

export function toIsoTimestamp(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return new Date().toISOString();
  const ms = Date.parse(raw);
  if (Number.isFinite(ms)) return new Date(ms).toISOString();
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) return new Date(asNum).toISOString();
  return new Date().toISOString();
}
