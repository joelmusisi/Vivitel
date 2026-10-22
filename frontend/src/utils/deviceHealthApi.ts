import { buildUrl, fetchJson, getApiKey, getTenantId, getTraccarDevices, getTraccarRoute } from "./api";
import type { DeviceHealthPosition, DeviceHealthResponse } from "./deviceHealth";

/** Window read from Traccar when the backend's push feed is not available. */
const FALLBACK_WINDOW_MS = 30 * 60_000;

export type DeviceHealthLoad = DeviceHealthResponse & {
  /** "feed": backend push feed. "traccar": direct Traccar positions (backend not updated or feed down). */
  via: "feed" | "traccar";
};

async function resolveDeviceId(deviceId: string, imei: string): Promise<string> {
  if (deviceId) return deviceId;
  if (!imei) return "";
  const devices = await getTraccarDevices().catch(() => []);
  const match = (Array.isArray(devices) ? devices : []).find(
    (device: any) => String(device?.uniqueId ?? "").replace(/\D+/g, "") === imei
  ) as { id?: number } | undefined;
  return match?.id ? String(match.id) : "";
}

/** Status of the Device Health endpoint, so a missing route is not reported as "no permission". */
async function probeDeviceHealth(query: string): Promise<number> {
  try {
    const apiKey = getApiKey();
    const tenantId = getTenantId();
    const response = await fetch(buildUrl(`/api/device-health?${query}`), {
      method: "GET",
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(tenantId ? { "x-tenant-id": tenantId } : {})
      }
    });
    return response.status;
  } catch {
    return 0;
  }
}

/**
 * Recent raw telemetry for one device. Prefers the backend push feed
 * (/api/device-health). If that endpoint is not deployed yet, or the feed is down,
 * reads the last 30 minutes of positions from Traccar instead.
 */
export async function loadDeviceHealth(params: { deviceId?: number | string; imei?: string }): Promise<DeviceHealthLoad> {
  const rawDeviceId = params.deviceId != null ? String(params.deviceId).trim() : "";
  const imei = String(params.imei ?? "").replace(/\D+/g, "");
  const query = new URLSearchParams();
  if (rawDeviceId) query.set("deviceId", rawDeviceId);
  if (imei) query.set("imei", imei);

  const fromFeed = await fetchJson<DeviceHealthResponse>(`/api/device-health?${query.toString()}`);
  if (fromFeed && fromFeed.ok !== false) {
    // Feed answered but has nothing yet (e.g. bridge just started): fill from Traccar below.
    if ((fromFeed.history ?? []).length) return { ...fromFeed, via: "feed" };
  } else {
    const status = await probeDeviceHealth(query.toString());
    if (status === 401 || status === 403) {
      return { ok: false, error: "Device Health is limited to Admin and Own Support accounts.", via: "feed" };
    }
    // 404 (backend not updated yet), 5xx or network: fall back to Traccar positions.
  }

  const deviceId = await resolveDeviceId(rawDeviceId, imei);
  if (!deviceId) {
    return { ok: false, error: "This asset is not linked to a tracking device (no device id or IMEI match).", via: "traccar" };
  }
  const to = new Date();
  const from = new Date(to.getTime() - FALLBACK_WINDOW_MS);
  let points: DeviceHealthPosition[] = [];
  try {
    points = (await getTraccarRoute({
      deviceId,
      from: from.toISOString(),
      to: to.toISOString()
    })) as unknown as DeviceHealthPosition[];
  } catch {
    return { ok: false, error: "Telemetry could not be loaded from the tracking server. Try Refresh now.", via: "traccar" };
  }
  const history = points.map((point) => ({ ...point, __source: "http" as const })).reverse();
  return {
    ok: true,
    deviceId: Number(deviceId),
    device: fromFeed?.device ?? { id: Number(deviceId), uniqueId: imei || undefined },
    history,
    feed: fromFeed?.feed ?? { socket: false, lastSocketAt: null, lastForwardAt: null },
    via: "traccar"
  };
}
