type AssetDotInput = {
  availability?: unknown;
  lastSeen?: unknown;
  lastPosition?: unknown;
  lastTrip?: unknown;
  speed?: unknown;
  staleHours?: number;
};

const parseTimestamp = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return Number.NaN;
  return Date.parse(raw);
};

export function computeAssetDotStatus(input: AssetDotInput): "online" | "warning" | "offline" {
  const availability = String(input.availability ?? "").trim().toLowerCase();
  if (availability === "unavailable" || availability === "not available") return "offline";

  const latest = Math.max(
    parseTimestamp(input.lastSeen),
    parseTimestamp(input.lastPosition),
    parseTimestamp(input.lastTrip)
  );
  if (!Number.isFinite(latest)) return "offline";

  const staleMs = Math.max(input.staleHours ?? 2, 0.1) * 60 * 60 * 1000;
  const ageMs = Date.now() - latest;
  if (ageMs <= staleMs) return "online";
  if (ageMs <= staleMs * 6) return "warning";

  const speed = Number(input.speed ?? 0);
  return Number.isFinite(speed) && speed > 0 ? "warning" : "offline";
}
