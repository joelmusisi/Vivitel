const LIST_KEYS = ["infos", "files", "list", "rows", "photos", "media", "safety", "alarms", "tracks", "status", "locations"];

/** Pull device/media rows out of CMS payloads, including `{ infos: { infos: [] } }` wrappers. */
export function cmsv6ObjectRows(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return cmsv6ObjectRows(item, depth + 1);
      const row = item as Record<string, unknown>;
      const nested = cmsv6ObjectRows(row, depth + 1);
      const hasList = LIST_KEYS.some((key) => row[key] != null);
      return hasList && nested.length ? nested : [row];
    });
  }
  if (typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  for (const key of LIST_KEYS) {
    if (row[key] == null) continue;
    const nested = cmsv6ObjectRows(row[key], depth + 1);
    if (nested.length) return nested;
  }
  const looksLikeRow = ["devIdno", "DevIDNO", "did", "vehiIdno", "vehIdno", "bTimeStr", "sTimeStr", "mlat", "lat", "mlng", "lng", "fileTime", "fileUrl", "DownUrl", "gt", "tm", "chn", "CHN", "beg", "year"].some(
    (key) => row[key] != null && row[key] !== ""
  );
  return looksLikeRow ? [row] : [];
}
