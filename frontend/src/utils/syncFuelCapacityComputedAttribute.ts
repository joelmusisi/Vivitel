import {
  createTraccarComputedAttribute,
  getTraccarComputedAttributes,
  updateTraccarComputedAttribute,
  type TraccarComputedAttribute,
  type TraccarComputedAttributeWritePayload
} from "./api";
import { readViviLibraryIdFromComputedItem } from "./traccarComputedAttributeApi";
import { buildFuelLevelJexlExpression } from "./traccarAttributeMapper";
import {
  buildFuelComputeConfigFromDeviceLine,
  resolveFuelAnalogLineFromDeviceBinding,
  type DeviceBindingLike
} from "./fuelComputeFromDevice";
import { isGpsIotServer } from "./regionServers";
import { isDatabaseTenant, readActiveTenantId } from "./tenantContext";

const FUEL_CAPACITY_ATTRIBUTE = "fuelLevel";
const FUEL_CAPACITY_DESCRIPTION = "Fuel capacity";
const DEVICE_FUEL_SOURCE = "device-binding-fuel";

function positiveId(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function deviceFuelLibraryId(bindingId: string): string {
  return `device-fuel:${String(bindingId ?? "").trim()}`;
}

function readDeviceBindingIdFromComputed(
  item: { attributes?: Record<string, unknown> } | null | undefined
): string {
  const attrs = item?.attributes;
  if (!attrs || typeof attrs !== "object") return "";
  return String((attrs as Record<string, unknown>).viviDeviceBindingId ?? "").trim();
}

function findExistingFuelCapacityAttribute(
  items: TraccarComputedAttribute[],
  bindingId: string,
  tenantId: string
): TraccarComputedAttribute | null {
  const libraryId = deviceFuelLibraryId(bindingId);
  const byLibrary =
    items.find((item) => readViviLibraryIdFromComputedItem(item) === libraryId) ?? null;
  if (byLibrary) return byLibrary;

  const byBinding = items.find((item) => {
    if (readDeviceBindingIdFromComputed(item) !== bindingId) return false;
    const kind = String(item.attributes?.viviComputeKind ?? "").trim().toLowerCase();
    const source = String(item.attributes?.viviSource ?? "").trim().toLowerCase();
    return kind === "fuel-level" || source === DEVICE_FUEL_SOURCE;
  });
  if (byBinding) return byBinding;

  // Legacy single fuelLevel attribute from notification-library sync for this tenant.
  return (
    items.find((item) => {
      const attr = String(item.attribute ?? "").trim();
      if (attr !== FUEL_CAPACITY_ATTRIBUTE) return false;
      const kind = String(item.attributes?.viviComputeKind ?? "").trim().toLowerCase();
      if (kind !== "fuel-level") return false;
      const itemTenant = String(item.attributes?.viviTenantId ?? "").trim();
      return !itemTenant || itemTenant === tenantId;
    }) ?? null
  );
}

export function buildFuelCapacityComputedAttributePayload(
  binding: DeviceBindingLike,
  tenantId: string
): TraccarComputedAttributeWritePayload | null {
  const bindingId = String(binding.id ?? "").trim();
  if (!bindingId) return null;

  const line = resolveFuelAnalogLineFromDeviceBinding(binding);
  const config = buildFuelComputeConfigFromDeviceLine(line);
  if (!config) return null;

  const expression = buildFuelLevelJexlExpression(config);
  if (!expression || expression === "null") return null;

  const bindingName = String(binding.name ?? "").trim();
  const description = bindingName
    ? `${FUEL_CAPACITY_DESCRIPTION} (${bindingName})`
    : FUEL_CAPACITY_DESCRIPTION;
  const libraryId = deviceFuelLibraryId(bindingId);

  return {
    description,
    attribute: FUEL_CAPACITY_ATTRIBUTE,
    expression,
    type: "number",
    priority: 1,
    attributes: {
      viviLibraryId: libraryId,
      viviSource: DEVICE_FUEL_SOURCE,
      viviDeviceBindingId: bindingId,
      viviTenantId: tenantId,
      viviComputeKind: "fuel-level",
      viviComputedExpression: expression,
      viviConfig: JSON.stringify({
        description: FUEL_CAPACITY_DESCRIPTION,
        fuelCompute: config,
        deviceBindingId: bindingId,
        deviceBindingName: bindingName
      })
    }
  };
}

export type SyncFuelCapacityResult = {
  ok: boolean;
  skipped?: boolean;
  created?: boolean;
  id?: number | null;
  error?: string;
};

/**
 * When a device binding Fuel line is configured and saved, create/update the
 * Traccar "Fuel capacity" computed attribute (attribute key: fuelLevel).
 */
export async function syncFuelCapacityComputedAttributeFromDeviceBinding(
  binding: DeviceBindingLike
): Promise<SyncFuelCapacityResult> {
  // UK GPS IoT: fuel calibration lives on the site device binding only — no Traccar attributes.
  if (isGpsIotServer()) {
    return { ok: true, skipped: true };
  }

  const tenantId = readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return { ok: true, skipped: true };
  }

  const payload = buildFuelCapacityComputedAttributePayload(binding, tenantId);
  if (!payload) {
    return { ok: true, skipped: true };
  }

  try {
    const items = await getTraccarComputedAttributes();
    const bindingId = String(binding.id ?? "").trim();
    const existing = findExistingFuelCapacityAttribute(items, bindingId, tenantId);
    const existingId = positiveId(existing?.id);

    if (existingId) {
      const result = await updateTraccarComputedAttribute(existingId, { ...payload, id: existingId });
      return {
        ok: result.ok,
        created: false,
        id: result.ok ? positiveId(result.body?.id) ?? existingId : existingId,
        ...(result.ok ? {} : { error: result.error })
      };
    }

    const created = await createTraccarComputedAttribute(payload);
    return {
      ok: created.ok,
      created: created.ok,
      id: created.ok ? positiveId(created.body?.id) : null,
      ...(created.ok ? {} : { error: created.error })
    };
  } catch (err: unknown) {
    return { ok: false, error: String((err as { message?: string })?.message ?? err) };
  }
}
