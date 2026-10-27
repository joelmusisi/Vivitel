/**
 * Traccar org.vivi.model.Attribute accepts only: id, description, attribute, expression, type, priority.
 * VIVI metadata is embedded in description as [vivi:...] because nested "attributes" is rejected.
 */

export const VIVI_COMPUTED_MARKER_RE = /\[vivi:([^\]]+)\]/;

export function readViviMarkerFromDescription(description: string): string {
  const match = String(description ?? "").match(VIVI_COMPUTED_MARKER_RE);
  return match ? match[1].trim() : "";
}

export function stripViviMarkerFromDescription(description: string): string {
  return String(description ?? "")
    .replace(VIVI_COMPUTED_MARKER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function appendViviMarkerToDescription(description: string, marker: string): string {
  const base = stripViviMarkerFromDescription(description);
  const id = String(marker ?? "").trim();
  if (!id) return base;
  return `${base} [vivi:${id}]`;
}

export type TraccarComputedAttributeApiBody = {
  id?: number;
  description: string;
  attribute: string;
  expression: string;
  type: string;
  priority: number;
};

export function toTraccarComputedAttributeApiBody(payload: {
  id?: number | string;
  description: string;
  attribute: string;
  expression: string;
  type: string;
  priority?: number;
  attributes?: Record<string, unknown>;
}): TraccarComputedAttributeApiBody {
  const attrs = payload.attributes && typeof payload.attributes === "object" ? payload.attributes : {};
  const marker = String((attrs as any).viviLibraryId ?? (attrs as any).viviBindingId ?? "").trim();
  const numericId = payload.id != null ? Number(payload.id) : NaN;
  const body: TraccarComputedAttributeApiBody = {
    description: appendViviMarkerToDescription(
      stripViviMarkerFromDescription(String(payload.description ?? "")),
      marker
    ),
    attribute: String(payload.attribute ?? "").trim(),
    expression: String(payload.expression ?? "").trim(),
    type: String(payload.type ?? "").trim(),
    priority: Number(payload.priority ?? 0) || 0
  };
  if (Number.isFinite(numericId) && numericId > 0) body.id = Math.trunc(numericId);
  return body;
}

export function readViviLibraryIdFromComputedItem(item: any): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const fromAttrs = String(attrs.viviLibraryId ?? attrs.viviBindingId ?? "").trim();
    if (fromAttrs) return fromAttrs;
  }
  return readViviMarkerFromDescription(String(item?.description ?? ""));
}

export function parseViviScopedLibraryId(libraryId: string): {
  tenantId: string;
  site: string;
  configGroupId: string;
  bindingId: string;
  eventKey: string;
} | null {
  const id = String(libraryId ?? "").trim();
  if (!id.startsWith("vivi:")) return null;
  const parts = id.split(":");
  if (parts.length < 6) return null;
  return {
    tenantId: parts[1] ?? "",
    site: parts[2] ?? "",
    configGroupId: parts[3] ?? "",
    bindingId: parts[4] ?? "",
    eventKey: parts.slice(5).join(":")
  };
}

const COMPUTED_ATTRIBUTE_WRITE_PATH_RE = /\/attributes\/computed(?:\/|\?|$)/i;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function isTraccarComputedAttributeWritePath(path: string): boolean {
  return COMPUTED_ATTRIBUTE_WRITE_PATH_RE.test(String(path ?? "").trim());
}

/** Sanitize any proxied or direct Traccar request body for computed attributes. */
export function sanitizeTraccarComputedAttributeRequestBody(
  path: string,
  method: string,
  rawBody: string | null | undefined
): string | undefined {
  if (!rawBody) return undefined;
  const verb = String(method ?? "GET").toUpperCase();
  if (!WRITE_METHODS.has(verb) || !isTraccarComputedAttributeWritePath(path)) return rawBody;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rawBody;
    return JSON.stringify(toTraccarComputedAttributeApiBody(parsed as any));
  } catch {
    return rawBody;
  }
}

export function readViviMetaFromComputedItem(
  item: any,
  field: "viviTenantId" | "viviBindingId" | "viviSite" | "viviConfigGroupId"
): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const direct = String((attrs as any)[field] ?? "").trim();
    if (direct) return direct;
  }
  const scoped = parseViviScopedLibraryId(readViviLibraryIdFromComputedItem(item));
  if (!scoped) return "";
  if (field === "viviTenantId") return scoped.tenantId;
  if (field === "viviSite") return scoped.site;
  if (field === "viviConfigGroupId") return scoped.configGroupId;
  if (field === "viviBindingId") return scoped.bindingId;
  return "";
}
