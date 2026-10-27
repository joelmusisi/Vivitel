/**
 * Shared Traccar live-row shape used by HTTP poll and the WebSocket bridge.
 * Keep in sync with frontend `api.ts` TraccarLivePosition / Live Tracking merge helpers.
 */

import { normalizeTraccarLivePosition } from "../shared/traccarPositionKeys";

export type TraccarLivePosition = {
  lat?: number;
  lng?: number;
  speed?: number;
  /** Traccar `course` (degrees); mirrored as heading for UI. */
  heading?: number;
  course?: number;
  altitude?: number;
  accuracy?: number;
  address?: string | null;
  valid?: boolean;
  protocol?: string;
  serverTime?: string;
  fixTime?: string;
  deviceTime?: string;
  geofenceIds?: number[];
  attributes?: Record<string, unknown>;
};

export type TraccarLiveRow = {
  deviceId?: number | string;
  imei?: string;
  name?: string;
  status?: string;
  lastUpdate?: string;
  fuelConfig?: Record<string, unknown>;
  position: TraccarLivePosition | null;
};

export type TraccarLivePayload = {
  ok: boolean;
  degraded?: boolean;
  at: string;
  count: number;
  live: TraccarLiveRow[];
  error?: string;
  source?: "socket" | "http" | "cache";
};

export function buildTraccarLiveRows(devices: any[], positions: any[]): TraccarLiveRow[] {
  const byDeviceId = new Map<number, any>();
  for (const item of positions) {
    const id = Number((item as any)?.deviceId);
    if (Number.isFinite(id)) byDeviceId.set(id, item);
  }

  return devices.map((device: any) => {
    const deviceId = Number(device?.id ?? 0);
    const pos = Number.isFinite(deviceId) ? byDeviceId.get(deviceId) ?? null : null;
    const deviceAttrs =
      device?.attributes && typeof device.attributes === "object"
        ? (device.attributes as Record<string, unknown>)
        : null;
    const fuelConfig = deviceAttrs
      ? {
          enabled:
            deviceAttrs.viviFuelComputeEnabled === true ||
            String(deviceAttrs.viviFuelComputeEnabled ?? "") === "true",
          analogInput: String(deviceAttrs.viviFuelAnalogInput ?? "").trim() || undefined,
          tankCapacity:
            String(deviceAttrs.viviFuelTankCapacityMax ?? deviceAttrs.viviFuelTankCapacity ?? "").trim() ||
            undefined,
          analogMvMin: String(deviceAttrs.viviFuelAnalogMvMin ?? "").trim() || undefined,
          analogMvMax: String(deviceAttrs.viviFuelAnalogMvMax ?? "").trim() || undefined,
          outputAttribute: String(deviceAttrs.viviFuelOutputAttribute ?? "").trim() || undefined,
          calibrationPoints: deviceAttrs.viviFuelCalibration
        }
      : null;
    const hasMaxVoltage = Boolean(
      (fuelConfig?.analogMvMax && Number(fuelConfig.analogMvMax) > 0) ||
        (fuelConfig?.analogMvMin && Number(fuelConfig.analogMvMin) > 0)
    );
    const hasCalibration = Boolean(
      fuelConfig?.calibrationPoints && String(fuelConfig.calibrationPoints).trim().length > 4
    );
    const hasFuelConfig = Boolean(
      fuelConfig &&
        (fuelConfig.enabled || fuelConfig.analogInput) &&
        fuelConfig.analogInput &&
        ((fuelConfig.tankCapacity && hasMaxVoltage) || hasCalibration)
    );

    const row: TraccarLiveRow = {
      deviceId: device?.id,
      imei: device?.uniqueId,
      name: device?.name,
      status: device?.status,
      lastUpdate: device?.lastUpdate,
      position: pos ? normalizeTraccarLivePosition(pos) : null
    };
    if (hasFuelConfig && fuelConfig) {
      row.fuelConfig = fuelConfig;
    }
    return row;
  });
}

export function buildTraccarLivePayload(
  devices: any[],
  positions: any[],
  options?: { degraded?: boolean; error?: string; source?: TraccarLivePayload["source"] }
): TraccarLivePayload {
  const live = buildTraccarLiveRows(devices, positions);
  return {
    ok: true,
    degraded: Boolean(options?.degraded),
    at: new Date().toISOString(),
    count: live.length,
    live,
    ...(options?.error ? { error: options.error } : {}),
    ...(options?.source ? { source: options.source } : {})
  };
}
