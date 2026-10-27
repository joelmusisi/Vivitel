export function coerceBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "yes" || s === "on" || s === "1") return true;
  if (s === "false" || s === "no" || s === "off" || s === "0") return false;
  return null;
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return null;
}
