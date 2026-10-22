const UUID_RE = /^[0-9a-f]{8}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{4}[- ]?[0-9a-f]{12}$/i;

export function looksLikeRawId(value: string): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const compact = text.replace(/[\s-]/g, "");
  return UUID_RE.test(text) || UUID_RE.test(compact) || /^[0-9a-f]{32}$/i.test(compact);
}

export function sanitizeFeedbackLabel(label: string, fallback: string): string {
  const text = String(label ?? "").trim();
  if (!text || looksLikeRawId(text)) return fallback;
  if (text.startsWith("{") && /"(id|stored|tenantId)"\s*:/.test(text) && text.length < 280) return fallback;
  if (text === "[object Object]") return fallback;
  return text;
}
