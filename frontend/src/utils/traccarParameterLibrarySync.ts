import {
  createTraccarComputedAttribute,
  deleteTraccarComputedAttribute,
  getTraccarComputedAttributes,
  updateTraccarComputedAttribute
} from "./api";
import { isDatabaseTenant, readActiveTenantId } from "./tenantContext";
import {
  buildParameterPassThroughExpression,
  isParameterAvailable,
  mapParameterTypeToTraccar,
  parameterLibraryId,
  parameterToComputedAttributeName,
  type ParameterCatalogRow
} from "./traccarAttributeMapper";
import { readViviLibraryIdFromComputedItem } from "./traccarComputedAttributeApi";

function readViviLibraryId(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  return readViviLibraryIdFromComputedItem(item);
}

async function findParameterAttribute(name: string) {
  const libraryId = parameterLibraryId(name);
  const attributeName = parameterToComputedAttributeName(name);
  const items = await getTraccarComputedAttributes();
  return (
    items.find((item) => readViviLibraryId(item) === libraryId) ??
    items.find((item) => String(item.attribute ?? "").trim() === attributeName) ??
    null
  );
}

export function buildParameterComputedAttributePayload(
  row: ParameterCatalogRow,
  tenantId: string
) {
  const name = String(row.name ?? "").trim();
  const libraryId = parameterLibraryId(name);
  return {
    description: name,
    attribute: parameterToComputedAttributeName(name),
    expression: buildParameterPassThroughExpression(name),
    type: mapParameterTypeToTraccar(String(row.type ?? "")),
    priority: 0,
    attributes: {
      viviLibraryId: libraryId,
      viviSource: "parameter-library",
      viviTenantId: tenantId,
      viviParameterName: name,
      viviParameterType: String(row.type ?? "").trim(),
      viviUnits: String(row.units ?? "").trim()
    }
  };
}

export async function syncParameterLibraryItemToTraccar(
  row: ParameterCatalogRow
): Promise<{ ok: boolean; error?: string }> {
  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return { ok: false, error: "Select a database before syncing parameters." };
  }

  const name = String(row.name ?? "").trim();
  if (!name) return { ok: false, error: "Parameter name is required." };

  if (!isParameterAvailable(row)) {
    return deleteParameterLibraryItemFromTraccar(name);
  }

  const payload = buildParameterComputedAttributePayload(row, tenantId);
  const existing = await findParameterAttribute(name);
  const traccarId = Number(existing?.id ?? 0);

  if (Number.isFinite(traccarId) && traccarId > 0) {
    const result = await updateTraccarComputedAttribute(traccarId, { ...payload, id: traccarId });
    return { ok: result.ok, error: result.error };
  }

  const result = await createTraccarComputedAttribute(payload);
  return { ok: result.ok, error: result.error };
}

export async function deleteParameterLibraryItemFromTraccar(name: string): Promise<{ ok: boolean; error?: string }> {
  const existing = await findParameterAttribute(name);
  const traccarId = Number(existing?.id ?? 0);
  if (!Number.isFinite(traccarId) || traccarId <= 0) return { ok: true };
  const result = await deleteTraccarComputedAttribute(traccarId);
  return { ok: result.ok, error: result.error };
}

export async function syncParameterLibraryItemsToTraccar(
  rows: ParameterCatalogRow[]
): Promise<{ ok: boolean; synced: number; failed: number; errors: string[] }> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const result = await syncParameterLibraryItemToTraccar(row);
    if (result.ok) synced += 1;
    else {
      failed += 1;
      if (result.error) errors.push(`${name}: ${result.error}`);
    }
  }

  return { ok: failed === 0, synced, failed, errors };
}
