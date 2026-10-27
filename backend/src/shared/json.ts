export function parseStoredJson(value: unknown): any {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  // In-memory DB mode stores JSON fields as objects already.
  return value;
}
