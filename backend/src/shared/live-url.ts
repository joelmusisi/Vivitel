import { liveText, liveChannelLabelByIndex } from "./live";

export const liveNormalizeUrlCandidate = (value: unknown, index: number) => {
  let raw = liveText(value);
  if (!raw) return "";
  raw = raw
    .replace(/\{channel\}|\$\{channel\}|:channel/gi, String(index))
    .replace(/\{index\}|\$\{index\}|:index/gi, String(index));
  if (!raw) return "";
  if (/^(https?:|wss?:|rtsp:)/i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^[a-z0-9.-]+(?::\d+)?\//i.test(raw) || /^[a-z0-9.-]+(?::\d+)$/i.test(raw)) {
    return `http://${raw}`;
  }
  return "";
};

export const liveReadChannelUrl = (row: Record<string, unknown>, index: number, key: string) => {
  const label = liveChannelLabelByIndex(index);
  const labelLower = label.toLowerCase();
  const labelCompact = label.replace(/\s+/g, "");
  const labelCompactLower = labelLower.replace(/\s+/g, "");

  const preferredCandidates = [
    row[`${key}StreamUrl`],
    row[`${key}Url`],
    row[`channel${index}StreamUrl`],
    row[`channel${index}Url`],
    row[`streamUrl${index}`],
    row[`liveUrl${index}`],
    row[label],
    row[labelLower],
    row[labelCompact],
    row[labelCompactLower],
    row[key]
  ];
  for (const value of preferredCandidates) {
    const next = liveNormalizeUrlCandidate(value, index);
    if (!next) continue;
    return next;
  }

  const candidates = [
    row.stream,
    row.hls,
    row.webrtc,
    row.rtsp,
    row.playbackUrl,
    row.streamUrlTemplate,
    row.channelUrlTemplate,
    row.liveUrlTemplate
  ];

  for (const value of candidates) {
    const next = liveNormalizeUrlCandidate(value, index);
    if (!next) continue;
    return next;
  }

  const listCandidates = [row.channelUrls, row.streamUrls, row.liveUrls, row.hlsUrls];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      const next = liveNormalizeUrlCandidate(candidate[index - 1], index);
      if (next) return next;
      continue;
    }
    if (candidate && typeof candidate === "object") {
      const map = candidate as Record<string, unknown>;
      const mapCandidates = [
        map[String(index)],
        map[key],
        map[liveChannelLabelByIndex(index)],
        map[liveChannelLabelByIndex(index).toLowerCase()],
        map[liveChannelLabelByIndex(index).replace(/\s+/g, "")],
        map[liveChannelLabelByIndex(index).toLowerCase().replace(/\s+/g, "")]
      ];
      for (const item of mapCandidates) {
        const next = liveNormalizeUrlCandidate(item, index);
        if (next) return next;
      }
    }
  }

  const channels = row.channels;
  if (Array.isArray(channels)) {
    const entry = channels[index - 1] as any;
    const next = liveNormalizeUrlCandidate(
      entry?.streamUrl
        ?? entry?.url
        ?? entry?.hlsUrl
        ?? entry?.webrtcUrl
        ?? entry?.rtspUrl
        ?? entry?.playbackUrl,
      index
    );
    if (next) return next;
  }

  const shared = liveNormalizeUrlCandidate(
    row.streamUrl
      ?? row.liveStreamUrl
      ?? row.url
      ?? row.liveUrl
      ?? row.videoUrl
      ?? row.hlsUrl
      ?? row.webrtcUrl
      ?? row.rtspUrl,
    index
  );
  if (shared) {
    try {
      const parsed = new URL(shared);
      if (!parsed.searchParams.has("channel")) parsed.searchParams.set("channel", String(index));
      return parsed.toString();
    } catch {
      return shared;
    }
  }

  return "";
};

export const liveResolveSessionUrl = (value: unknown, origin: string) => {
  const raw = liveText(value);
  if (!raw) return "";
  if (/^(https?:|wss?:|rtsp:)/i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;
  if (/^\//.test(raw) && origin) return `${origin.replace(/\/$/, "")}${raw}`;
  return raw;
};

export const liveReadUrlFromUnknown = (value: unknown, index: number, key: string, label: string) => {
  if (!value) return "";
  if (typeof value === "string") return liveNormalizeUrlCandidate(value, index);
  if (Array.isArray(value)) {
    const byIndex = liveNormalizeUrlCandidate(value[index - 1], index);
    if (byIndex) return byIndex;
    return "";
  }
  if (typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  const direct = [
    row.streamUrl,
    row.url,
    row.hlsUrl,
    row.webrtcUrl,
    row.rtspUrl,
    row.playbackUrl,
    row[`${key}StreamUrl`],
    row[`${key}Url`],
    row[String(index)],
    row[key],
    row[label],
    row[label.toLowerCase()],
    row[label.replace(/\s+/g, "")],
    row[label.toLowerCase().replace(/\s+/g, "")]
  ];
  for (const candidate of direct) {
    const resolved = liveNormalizeUrlCandidate(candidate, index);
    if (resolved) return resolved;
  }
  const channels = row.channels;
  if (Array.isArray(channels)) {
    const entry = channels[index - 1] as any;
    return liveNormalizeUrlCandidate(
      entry?.streamUrl
        ?? entry?.url
        ?? entry?.hlsUrl
        ?? entry?.webrtcUrl
        ?? entry?.rtspUrl
        ?? entry?.playbackUrl,
      index
    );
  }
  return "";
};
