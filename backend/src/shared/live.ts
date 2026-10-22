export const liveText = (value: unknown) => String(value ?? "").trim();

export const liveHasValue = (value: unknown) => {
  const raw = liveText(value).toLowerCase();
  if (!raw) return false;
  return raw !== "-" && raw !== "--" && raw !== "n/a" && raw !== "none" && raw !== "null" && raw !== "undefined";
};

export const liveNormalizeChannelKey = (value: unknown) =>
  liveText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const liveChannelLabelByIndex = (index: number) => {
  if (index === 1) return "Forward";
  if (index === 2) return "DMS";
  if (index === 3) return "In cab";
  if (index === 4) return "External L";
  if (index === 5) return "External R";
  return `Camera ${index}`;
};