import { spawnSync } from "child_process";
import { listBindings } from "./config";
import { liveText, liveHasValue, liveNormalizeChannelKey, liveChannelLabelByIndex } from "./live";
import { liveNormalizeUrlCandidate, liveReadChannelUrl, liveResolveSessionUrl, liveReadUrlFromUnknown } from "./live-url";

// Global state/constants - initialized by vps_server.ts
declare let DEVICE_SERVER_DOMAIN: string;
declare let DEVICE_SERVER_PORT: string;
declare let DEVICE_SERVER_PROTOCOL: string;
declare let DEVICE_SERVER_API_KEY: string;
declare let LIVE_STREAM_PROVIDER_URL: string;
declare let LIVE_STREAM_PROVIDER_API_KEY: string;
declare let LIVE_STREAM_PROVIDER_TENANT: string;

export const liveResolveBoundCameraIdForAsset = (tenant: string, assetId: string) => {
  const cleanAssetId = liveText(assetId);
  if (!cleanAssetId) return "";
  try {
    const bindings = listBindings(tenant, "devices");
    const record = bindings.find((row: any) => String(row?.id ?? "").trim() === "camera-asset-bindings") ?? null;
    const mappings = Array.isArray((record as any)?.mappings) ? (record as any).mappings : [];
    const match = mappings.find((mapping: any) => String(mapping?.assetId ?? "").trim() === cleanAssetId) ?? null;
    if (match) return String(match?.cameraId ?? "").trim();
    if (/^\d{14,17}$/.test(cleanAssetId)) return cleanAssetId;
    return "";
  } catch {
    return "";
  }
};

export const resolveLiveStreamFromDeviceServer = async (
  cameraId: string,
  channel: number,
  channelKey: string,
  channelLabel: string,
  diagnostics?: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  }
) => {
  if (!DEVICE_SERVER_DOMAIN || !DEVICE_SERVER_PORT) return "";
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) return "";
  const base = `${DEVICE_SERVER_PROTOCOL}://${DEVICE_SERVER_DOMAIN}:${DEVICE_SERVER_PORT}`.replace(/\/$/, "");
  const id = encodeURIComponent(String(cameraId ?? "").trim());
  if (!id) return "";

  const queries = new URLSearchParams({
    channel: String(channel),
    channelKey: String(channelKey ?? "").trim(),
    channelLabel: String(channelLabel ?? "").trim()
  });
  const attempts = [
    `${base}/devices/${id}/stream?${queries.toString()}`,
    `${base}/devices/${id}/live?${queries.toString()}`,
    `${base}/device/${id}/stream?${queries.toString()}`,
    `${base}/stream/${id}?${queries.toString()}`,
    `${base}/devices/${id}`
  ];

  const headers: Record<string, string> = { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" };
  if (DEVICE_SERVER_API_KEY) headers["x-api-key"] = DEVICE_SERVER_API_KEY;

  for (const endpoint of attempts) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetchFn(endpoint, { method: "GET", headers });
      if (diagnostics) {
        diagnostics.endpointStatuses = diagnostics.endpointStatuses ?? [];
        diagnostics.endpointStatuses.push({ endpoint, status: Number(resp.status ?? 0) });
      }
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text) continue;
      const fromText = liveNormalizeUrlCandidate(text.trim(), channel);
      if (fromText) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return liveResolveSessionUrl(fromText, base);
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const fromJson = liveReadUrlFromUnknown(parsed, channel, channelKey, channelLabel);
      if (fromJson) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return liveResolveSessionUrl(fromJson, base);
      }
    } catch {
      continue;
    }
  }

  return "";
};

export const resolveLiveStreamFromProvider = async (
  assetId: string,
  cameraId: string,
  channel: number,
  channelKey: string,
  channelLabel: string,
  diagnostics?: {
    attemptedEndpoints: string[];
    matchedEndpoint?: string;
    endpointStatuses?: Array<{ endpoint: string; status: number }>;
  }
) => {
  if (!LIVE_STREAM_PROVIDER_URL) return "";
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) return "";

  const body = {
    ...(assetId ? { assetId } : {}),
    ...(cameraId ? { cameraId } : {}),
    channel,
    channelKey,
    channelLabel
  };

  const base = LIVE_STREAM_PROVIDER_URL.replace(/\/$/, "");
  const endpoints = [
    base,
    `${base}/camera/live/session`,
    `${base}/live/session`,
    `${base}/stream/session`,
    `${base}/stream/live`
  ];

  const headers: Record<string, string> = {
    "content-type": "application/json",
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8"
  };
  if (LIVE_STREAM_PROVIDER_API_KEY) {
    headers["x-api-key"] = LIVE_STREAM_PROVIDER_API_KEY;
    headers.Authorization = `Bearer ${LIVE_STREAM_PROVIDER_API_KEY}`;
  }
  if (LIVE_STREAM_PROVIDER_TENANT) headers["x-tenant-id"] = LIVE_STREAM_PROVIDER_TENANT;

  for (const endpoint of endpoints) {
    if (diagnostics) diagnostics.attemptedEndpoints.push(endpoint);
    try {
      const resp = await fetchFn(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      if (diagnostics) {
        diagnostics.endpointStatuses = diagnostics.endpointStatuses ?? [];
        diagnostics.endpointStatuses.push({ endpoint, status: Number(resp.status ?? 0) });
      }
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text) continue;
      const fromText = liveNormalizeUrlCandidate(text.trim(), channel);
      if (fromText) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return fromText;
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const fromPayload = liveReadUrlFromUnknown(
        parsed?.streamUrl
          ?? parsed?.url
          ?? parsed?.data
          ?? parsed?.payload
          ?? parsed,
        channel,
        channelKey,
        channelLabel
      );
      if (fromPayload) {
        if (diagnostics) diagnostics.matchedEndpoint = endpoint;
        return fromPayload;
      }
    } catch {
      continue;
    }
  }

  return "";
};

export const liveBuildChannels = (camera: Record<string, unknown> | null, asset: Record<string, unknown> | null) => {
  const labels: string[] = [];

  const addLabel = (value: unknown) => {
    const label = liveText(value);
    if (!label || labels.includes(label)) return;
    labels.push(label);
  };

  const collect = (row: Record<string, unknown> | null) => {
    if (!row) return;
    const arrays = [row.channelNames, row.selectedChannels, row.cameraChannelsSelected];
    for (const arr of arrays) {
      if (!Array.isArray(arr)) continue;
      for (const value of arr) addLabel(value);
    }

    if (liveHasValue(row.forward) || liveHasValue(row.forwardCamera)) addLabel("Forward");
    if (liveHasValue((row as any).adas) || liveHasValue((row as any).adasCamera)) addLabel("ADAS");
    if (liveHasValue((row as any).dms) || liveHasValue((row as any).dmsCamera)) addLabel("DMS");
    if (liveHasValue(row.inCab) || liveHasValue(row.inCabCamera)) addLabel("In cab");
  };

  collect(camera);
  collect(asset);

  const numericCandidates = [
    Number((camera as any)?.channelCount ?? 0),
    Number((camera as any)?.channels ?? 0),
    Number((asset as any)?.channelCount ?? 0),
    Number((asset as any)?.channels ?? 0),
    Number((asset as any)?.cameraChannels ?? 0)
  ].filter((n) => Number.isFinite(n) && n > 0) as number[];
  const declaredCount = numericCandidates.length ? Math.max(...numericCandidates) : 0;
  const count = Math.max(3, declaredCount, labels.length, 1);

  return Array.from({ length: Math.min(count, 16) }, (_, idx) => {
    const index = idx + 1;
    const label = labels[idx] || liveChannelLabelByIndex(index);
    const key = liveNormalizeChannelKey(label) || `channel-${index}`;
    const url =
      (camera ? liveReadChannelUrl(camera, index, key) : "")
      || (asset ? liveReadChannelUrl(asset, index, key) : "");
    return {
      index,
      key,
      label,
      ...(url ? { streamUrl: url } : {})
    };
  });
};

export const liveFindRecordByNeedle = (rows: Record<string, unknown>[], needle: string, fields: string[]) => {
  const target = liveText(needle).toLowerCase();
  if (!target) return null;
  return rows.find((row) => fields.some((field) => liveText((row as any)?.[field]).toLowerCase() === target)) ?? null;
};

export const probeStreamQuality = (streamUrl: string) => {
  const target = liveText(streamUrl);
  if (!target) {
    return { ok: false, error: "streamUrl is required" } as const;
  }

  const ffprobe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate,bit_rate",
      "-of",
      "json",
      target
    ],
    { encoding: "utf8", timeout: 12000 }
  );

  if (ffprobe.error && (ffprobe.error as any)?.code === "ENOENT") {
    return { ok: false, error: "ffprobe is not installed on server PATH" } as const;
  }
  if ((ffprobe.status ?? 1) !== 0) {
    return {
      ok: false,
      error: liveText(ffprobe.stderr) || "ffprobe failed"
    } as const;
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(liveText(ffprobe.stdout) || "{}");
  } catch {
    parsed = null;
  }
  const stream = Array.isArray(parsed?.streams) ? parsed.streams[0] : null;
  const width = Number(stream?.width ?? 0);
  const height = Number(stream?.height ?? 0);
  const bitRate = Number(stream?.bit_rate ?? 0);
  const avgFrameRateRaw = liveText(stream?.avg_frame_rate);
  let avgFps = 0;
  if (avgFrameRateRaw.includes("/")) {
    const [a, b] = avgFrameRateRaw.split("/").map((v) => Number(v));
    if (Number.isFinite(a) && Number.isFinite(b) && b > 0) avgFps = a / b;
  } else {
    avgFps = Number(avgFrameRateRaw);
  }
  const isHd = width >= 1280 && height >= 720;

  return {
    ok: true,
    result: {
      codec: liveText(stream?.codec_name) || null,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      fps: Number.isFinite(avgFps) ? Number(avgFps.toFixed(2)) : 0,
      bitRate: Number.isFinite(bitRate) ? bitRate : 0,
      isHd
    }
  } as const;
};
