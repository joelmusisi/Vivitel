import type { Express } from "express";

interface RegisterCameraLiveSessionRouteDeps {
  app: Express;
  db: any;
  requireApiKey: (req: any, res: any) => boolean;
  readTenant: (req: any) => { raw: string; tenant: string };
  listCameraHealth: (tenantId: string) => any[];
  parseStoredJson: (value: any) => any;
  liveText: (value: any) => string;
  liveResolveBoundCameraIdForAsset: (tenantId: string, assetId: string) => string;
  liveFindRecordByNeedle: (rows: Record<string, unknown>[], needle: any, fields: string[]) => Record<string, unknown> | null;
  liveBuildChannels: (camera: Record<string, unknown> | null, asset: Record<string, unknown> | null) => any[];
  liveResolveSessionUrl: (streamUrl: string, origin: string) => string;
  liveNormalizeChannelKey: (value: any) => string;
  liveChannelLabelByIndex: (index: number) => string;
  resolveLiveStreamFromProvider: (
    assetId: string,
    cameraId: string,
    channel: number,
    channelKey: string,
    channelLabel: string,
    diagnostics: { attemptedEndpoints: string[]; matchedEndpoint?: string; endpointStatuses?: Array<{ endpoint: string; status: number }> }
  ) => Promise<string>;
  resolveLiveStreamFromDeviceServer: (
    cameraId: string,
    channel: number,
    channelKey: string,
    channelLabel: string,
    diagnostics: { attemptedEndpoints: string[]; matchedEndpoint?: string; endpointStatuses?: Array<{ endpoint: string; status: number }> }
  ) => Promise<string>;
  resolveLiveStreamFromCmsv6?: (
    tenantId: string,
    site: string,
    cameraId: string,
    channel: number,
    userId?: string
  ) => Promise<string>;
  cryptoRandom: () => string;
}

export function registerCameraLiveSessionRoute(deps: RegisterCameraLiveSessionRouteDeps): void {
  const {
    app,
    db,
    requireApiKey,
    readTenant,
    listCameraHealth,
    parseStoredJson,
    liveText,
    liveResolveBoundCameraIdForAsset,
    liveFindRecordByNeedle,
    liveBuildChannels,
    liveResolveSessionUrl,
    liveNormalizeChannelKey,
    liveChannelLabelByIndex,
    resolveLiveStreamFromProvider,
    resolveLiveStreamFromDeviceServer,
    resolveLiveStreamFromCmsv6,
    cryptoRandom,
  } = deps;

  app.post("/camera/live/session", async (req, res) => {
    if (!requireApiKey(req, res)) return res.status(401).json({ error: "Unauthorized" });
    const { raw, tenant } = readTenant(req as any);
    const tenantForLookup = String(tenant || "default").trim() || "default";
    const body = (req.body ?? {}) as Record<string, unknown>;

    const requestedChannel = Number(body.channel ?? 1);
    const channel = Number.isFinite(requestedChannel) && requestedChannel > 0 ? Math.min(16, Math.floor(requestedChannel)) : 1;

    let cameraRows = listCameraHealth(tenantForLookup) as Record<string, unknown>[];
    const assetStmt = raw && raw !== tenantForLookup
      ? db.prepare("SELECT data FROM assets WHERE tenant_id = ? OR tenant_id = ? ORDER BY updated_at DESC")
      : db.prepare("SELECT data FROM assets WHERE tenant_id = ? ORDER BY updated_at DESC");
    const assetRows = (raw && raw !== tenantForLookup ? assetStmt.all(tenantForLookup, raw) : assetStmt.all(tenantForLookup))
      .map((row: any) => parseStoredJson(row?.data))
      .filter((row: any) => row && typeof row === "object") as Record<string, unknown>[];

    const requestedCameraId = liveText(body.cameraId ?? body.deviceId);
    const requestedAssetId = liveText(body.assetId);
    const boundCameraId = requestedAssetId ? liveResolveBoundCameraIdForAsset(tenantForLookup, requestedAssetId) : "";
    const includeDebug = String(body.debugLive ?? body.debug ?? req.query.debug ?? "").trim().toLowerCase() === "1"
      || String(body.debugLive ?? body.debug ?? req.query.debug ?? "").trim().toLowerCase() === "true";

    const asset = liveFindRecordByNeedle(assetRows, requestedAssetId, ["id", "assetId", "registration", "imei"]) ?? null;
    const cameraFromAsset = asset
      ? liveFindRecordByNeedle(
        cameraRows,
        liveText((asset as any)?.cameraId ?? (asset as any)?.cameraSerial ?? (asset as any)?.imei),
        ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"]
      )
      : null;
    const cameraFromBinding = boundCameraId
      ? liveFindRecordByNeedle(cameraRows, boundCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
      : null;
    if (!cameraFromBinding && boundCameraId) {
      try {
        const row = db
          .prepare("SELECT data, updated_at FROM camera_health WHERE camera_id = ? ORDER BY updated_at DESC LIMIT 1")
          .get(boundCameraId);
        const parsed = parseStoredJson((row as any)?.data);
        if (parsed && typeof parsed === "object") {
          cameraRows = [parsed as Record<string, unknown>, ...cameraRows];
        }
      } catch {
        // ignore
      }
    }
    const cameraFromBindingAnyTenant = boundCameraId
      ? liveFindRecordByNeedle(cameraRows, boundCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
      : null;
    const camera =
      liveFindRecordByNeedle(cameraRows, requestedCameraId, ["cameraId", "id", "cameraSerial", "serial", "deviceId", "imei", "deviceImei"])
      || cameraFromBinding
      || cameraFromBindingAnyTenant
      || cameraFromAsset
      || null;

    const channels = liveBuildChannels(camera, asset);
    const origin = `${req.protocol}://${req.get("host")}`;
    const normalizedChannels = channels.map((row: any) => ({
      ...row,
      ...(row?.streamUrl ? { streamUrl: liveResolveSessionUrl(row.streamUrl, origin) } : {})
    }));
    let selected = normalizedChannels.find((row) => row.index === channel) || normalizedChannels[0] || null;
    let streamUrl = liveText((selected as any)?.streamUrl);
    const selectedChannelKey = liveText((selected as any)?.key) || liveNormalizeChannelKey((selected as any)?.label) || `channel-${channel}`;
    const selectedChannelLabel = liveText((selected as any)?.label) || liveChannelLabelByIndex(channel);
    const selectedCameraId = liveText((camera as any)?.cameraId ?? (camera as any)?.id ?? boundCameraId ?? (asset as any)?.cameraId ?? (asset as any)?.cameraSerial ?? (asset as any)?.imei ?? requestedCameraId);
    const selectedAssetId = liveText((asset as any)?.id ?? (asset as any)?.assetId);
    const fallbackDiagnostics: {
      attemptedEndpoints: string[];
      matchedEndpoint?: string;
      endpointStatuses?: Array<{ endpoint: string; status: number }>;
    } = { attemptedEndpoints: [] };
    const providerDiagnostics: {
      attemptedEndpoints: string[];
      matchedEndpoint?: string;
      endpointStatuses?: Array<{ endpoint: string; status: number }>;
    } = { attemptedEndpoints: [] };

    if (!streamUrl && (selectedCameraId || selectedAssetId)) {
      const providerUrl = await resolveLiveStreamFromProvider(
        selectedAssetId,
        selectedCameraId,
        channel,
        selectedChannelKey,
        selectedChannelLabel,
        providerDiagnostics
      );
      if (providerUrl) {
        streamUrl = providerUrl;
        selected = {
          ...(selected as any),
          streamUrl: providerUrl
        };
      }
    }

    if (!streamUrl && selectedCameraId) {
      const fallbackUrl = await resolveLiveStreamFromDeviceServer(
        selectedCameraId,
        channel,
        selectedChannelKey,
        selectedChannelLabel,
        fallbackDiagnostics
      );
      if (fallbackUrl) {
        streamUrl = fallbackUrl;
        selected = {
          ...(selected as any),
          streamUrl: fallbackUrl
        };
      }
    }

    if (!streamUrl && selectedCameraId && resolveLiveStreamFromCmsv6) {
      const site = liveText(req.header("x-site-name") ?? req.query.site ?? body.site);
      const cmsUrl = await resolveLiveStreamFromCmsv6(
        tenantForLookup,
        site,
        selectedCameraId,
        channel,
        liveText(req.header("x-vivi-user-id") ?? req.header("x-vivi-user-email"))
      );
      if (cmsUrl) {
        streamUrl = cmsUrl;
        selected = {
          ...(selected as any),
          streamUrl: cmsUrl,
          provider: "cmsv6"
        };
      }
    }

    return res.json({
      ok: true,
      available: Boolean(streamUrl),
      source: camera ? "camera" : asset ? "asset" : "none",
      cameraId: liveText((camera as any)?.cameraId ?? (camera as any)?.id) || requestedCameraId || null,
      assetId: liveText((asset as any)?.id ?? (asset as any)?.assetId) || null,
      channel: selected,
      channels: normalizedChannels,
      streamUrl: streamUrl || null,
      token: streamUrl ? cryptoRandom() : null,
      message: streamUrl
        ? "Live stream session prepared."
        : "No stream URL configured for the selected channel.",
      ...(includeDebug
        ? {
            diagnostics: {
              tenant: tenantForLookup,
              requested: {
                assetId: requestedAssetId || null,
                cameraId: requestedCameraId || null,
                channel,
                channelKey: selectedChannelKey,
                channelLabel: selectedChannelLabel
              },
              resolved: {
                source: camera ? "camera" : asset ? "asset" : "none",
                assetFound: Boolean(asset),
                cameraFound: Boolean(camera),
                selectedCameraId: selectedCameraId || null,
                boundCameraId: boundCameraId || null,
                channelsDiscovered: normalizedChannels.length,
                selectedHasStreamUrl: Boolean(streamUrl)
              },
              deviceServerFallback: fallbackDiagnostics,
              providerFallback: providerDiagnostics
            }
          }
        : {})
    });
  });
}
