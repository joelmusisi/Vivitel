type TraccarFetch = (
  pathnameWithQuery: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; body: any }>;

export const pickTraccarPositionAt = (position: any): string => {
  const raw = String(
    position?.deviceTime ??
      position?.fixTime ??
      position?.serverTime ??
      position?.timestamp ??
      ""
  ).trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

export function createTraccarPositionResolver(traccarFetch: TraccarFetch) {
  return async function traccarResolveLatestPositionByImei(imei: string) {
    const clean = String(imei ?? "").trim();
    if (!clean) return null;

    const devicesResp = await traccarFetch("/api/devices?all=true");
    if (!devicesResp.ok || !Array.isArray(devicesResp.body)) return null;

    const device = (devicesResp.body as any[]).find((d: any) => String(d?.uniqueId ?? "").trim() === clean) ?? null;
    if (!device) return null;

    const deviceId = Number((device as any)?.id);
    if (!Number.isFinite(deviceId)) return null;

    let positions: any[] = [];
    const byDeviceResp = await traccarFetch(`/api/positions?deviceId=${encodeURIComponent(String(deviceId))}`);
    if (byDeviceResp.ok && Array.isArray(byDeviceResp.body)) {
      positions = byDeviceResp.body as any[];
    }

    if (!positions.length) {
      const positionId = Number((device as any)?.positionId);
      if (Number.isFinite(positionId)) {
        const byIdResp = await traccarFetch(`/api/positions?id=${encodeURIComponent(String(positionId))}`);
        if (byIdResp.ok && Array.isArray(byIdResp.body)) {
          positions = byIdResp.body as any[];
        }
      }
    }

    if (!positions.length) return null;

    const sorted = [...positions].sort((a, b) => {
      const aAt = Date.parse(String(a?.deviceTime ?? a?.fixTime ?? a?.serverTime ?? ""));
      const bAt = Date.parse(String(b?.deviceTime ?? b?.fixTime ?? b?.serverTime ?? ""));
      const aTs = Number.isFinite(aAt) ? aAt : -1;
      const bTs = Number.isFinite(bAt) ? bAt : -1;
      return bTs - aTs;
    });

    return sorted[0] ?? null;
  };
}
