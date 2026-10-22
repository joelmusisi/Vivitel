import type { NotificationRow } from "../data/notificationLibrary";
import {
  isActiveOnlyFuelNotificationDescription,
  traccarDefaultNotificationNames
} from "../data/notificationLibrary";
import {
  beginTraccarListCacheBatch,
  createTraccarComputedAttribute,
  createTraccarNotification,
  deleteTraccarComputedAttribute,
  deleteTraccarNotification,
  endTraccarListCacheBatch,
  getTraccarComputedAttributes,
  getTraccarNotifications,
  updateTraccarComputedAttribute,
  updateTraccarNotification,
  type TraccarComputedAttribute,
  type TraccarComputedAttributeWritePayload,
  type TraccarNotification,
  type TraccarNotificationWritePayload
} from "./api";
import { isGpsIotServer } from "./regionServers";
import { isDatabaseTenant, readActiveTenantId } from "./tenantContext";
import {
  buildComputedAttributeExpressionFromLibrary,
  buildJexlExpressionFromConditions,
  isFuelComputeNotification,
  readFuelComputeConfig,
  resolveComputedAttributeTypeFromLibrary,
  resolveFuelComputeOutputAttribute,
  type NotificationCondition,
  type ParameterCatalogRow
} from "./traccarAttributeMapper";
import {
  parseViviScopedLibraryId,
  readViviLibraryIdFromComputedItem,
  readViviMetaFromComputedItem
} from "./traccarComputedAttributeApi";
import type { DeviceBindingLike } from "./fuelComputeFromDevice";
import {
  buildFuelComputeExpressionFromDevice,
  buildFuelComputeOutputKey,
  buildMergedFuelComputeConfig,
  describeMissingFuelComputePrerequisites,
  fuelComputeReadyFromDevice
} from "./fuelComputeFromDevice";
import { buildTraccarNotificatorsForLibraryRow } from "./notificationAlertDelivery";
export type { NotificationCondition };

export type LibraryTraccarSyncOptions = {
  parameterCatalog?: ParameterCatalogRow[];
  tenantId?: string;
  deviceBinding?: DeviceBindingLike | null;
  /** Prefetched catalogs — avoids GET /notifications and GET /attributes/computed per item. */
  notificationsCatalog?: TraccarNotification[];
  computedAttributesCatalog?: TraccarComputedAttribute[];
};

export type TraccarScopedSyncContext = {
  tenantId: string;
  site: string;
  siteId?: string;
  configGroupId: string;
  configGroupName: string;
  bindingId: string;
  bindingName: string;
  traccarGroupId?: number;
};

const slug = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function buildScopedViviLibraryId(scope: TraccarScopedSyncContext, eventKey: string) {
  return `vivi:${scope.tenantId}:${slug(scope.site)}:${slug(scope.configGroupId)}:${scope.bindingId}:${slug(eventKey)}`;
}

export function buildScopedComputedAttributeKey(scope: TraccarScopedSyncContext, eventKey: string) {
  const safe = slug(eventKey).replace(/-/g, "_");
  return `viviEvt_${slug(scope.site)}_${slug(scope.configGroupId)}_${safe}`.slice(0, 120);
}

export function readTraccarItemTenantId(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const direct = String((attrs as any).viviTenantId ?? "").trim();
    if (direct) return direct;
  }
  return readViviMetaFromComputedItem(item, "viviTenantId");
}

export function readTraccarItemSite(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const direct = String((attrs as any).viviSite ?? "").trim();
    if (direct) return direct;
  }
  return readViviMetaFromComputedItem(item, "viviSite");
}

export function readTraccarItemBindingId(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const direct = String((attrs as any).viviBindingId ?? "").trim();
    if (direct) return direct;
  }
  return readViviMetaFromComputedItem(item, "viviBindingId");
}

export function readTraccarItemConfigGroupId(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const direct = String((attrs as any).viviConfigGroupId ?? "").trim();
    if (direct) return direct;
  }
  return readViviMetaFromComputedItem(item, "viviConfigGroupId");
}

const TRACCAR_EVENT_TYPE_BY_NAME: Record<string, string> = {
  "status online": "deviceOnline",
  "status offline": "deviceOffline",
  "device inactive": "deviceUnknown",
  "device moving": "deviceMoving",
  "device stopped": "deviceStopped",
  "ignition on": "ignitionOn",
  "ignition off": "ignitionOff",
  "speed limit exceeded": "deviceOverspeed",
  "fuel drop": "fuelDrop",
  "fuel increase": "fuelIncrease",
  "fuel siphoning": "fuelDrop",
  "fuel gradual drop": "fuelDrop",
  "fuel refill (detected)": "fuelIncrease",
  "fuel siphoning (detected)": "fuelDrop",
  "geofence entered": "geofenceEnter",
  "geofence exited": "geofenceExit",
  "alarm": "alarm",
  "media": "media",
  "driver changed": "driverChanged",
  "maintenance required": "maintenance"
};

export function toNotificationLibraryBindingId(row: NotificationRow): string {
  const eventId = String(row.eventId ?? "").trim();
  if (eventId) return `notification:${eventId}`;
  const slug = String(row.description ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `notification:${slug || "custom"}`;
}

export function toComputedAttributeKey(eventId: string): string {
  const safe = String(eventId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe ? `viviEvt_${safe}` : "viviEvt_custom";
}

function normalizeKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveTraccarNotificationType(description: string, libraryType: string): string {
  const mapped = TRACCAR_EVENT_TYPE_BY_NAME[normalizeKey(description)];
  if (mapped) return mapped;
  if (traccarDefaultNotificationNames.some((name) => normalizeKey(name) === normalizeKey(description))) {
    return "alarm";
  }
  if (normalizeKey(libraryType) === "default") return "alarm";
  return "alarm";
}

export { buildJexlExpressionFromConditions } from "./traccarAttributeMapper";

export function traccarItemMatchesLibraryRow(
  item: { attributes?: Record<string, unknown>; description?: string } | null | undefined,
  row: NotificationRow,
  tenantId?: string
): boolean {
  const libraryId = toNotificationLibraryBindingId(row);
  const itemId = readViviLibraryIdFromComputedItem(item);
  if (itemId === libraryId) return true;
  if (tenantId) {
    const itemTenant = readTraccarItemTenantId(item);
    if (itemTenant && itemTenant !== tenantId) return false;
  }
  const scoped = parseViviScopedLibraryId(itemId);
  if (scoped) {
    const eventKey = String(row.eventId ?? row.description ?? "").trim();
    if (slug(scoped.eventKey) === slug(eventKey)) return true;
  }
  // Fallback: description match when viviLibraryId is missing or drifted.
  const itemDescription = String(item?.description ?? "").trim().toLowerCase();
  const rowDescription = String(row.description ?? "").trim().toLowerCase();
  return Boolean(itemDescription && rowDescription && itemDescription === rowDescription);
}

export function buildTraccarNotificationPayloadFromLibrary(
  row: NotificationRow,
  bindingId = toNotificationLibraryBindingId(row),
  _scope?: TraccarScopedSyncContext,
  options?: LibraryTraccarSyncOptions
): TraccarNotificationWritePayload {
  const description = String(row.description ?? "").trim();
  const eventId = String(row.eventId ?? "").trim();
  const availability = String(row.availability ?? "").trim();
  const libraryType = String(row.type ?? "").trim();
  const parameters = row.parameters ?? {};
  const conditions = Array.isArray((parameters as any).conditions) ? (parameters as any).conditions : [];
  const libraryId = bindingId;
  const tenantId = options?.tenantId ?? "";

  return {
    type: resolveTraccarNotificationType(description, libraryType),
    description,
    // Available publishes the notification. It must still be linked per device,
    // otherwise one site's threshold fires for every asset on the server.
    always: false,
    commandId: 0,
    calendarId: 0,
    notificators: buildTraccarNotificatorsForLibraryRow(row),
    attributes: {
      viviLibraryId: libraryId,
      viviSource: "notification-library",
      viviBindingId: bindingId,
      ...(tenantId ? { viviTenantId: tenantId } : {}),
      ...(eventId ? { viviEventId: eventId } : {}),
      ...(libraryType ? { viviType: libraryType } : {}),
      ...(availability ? { viviAvailability: availability } : {}),
      viviConfig: JSON.stringify({
        description,
        eventId,
        type: libraryType,
        availability,
        notificationVideo: row.notificationVideo ?? null,
        parameters
      }),
      viviConditions: JSON.stringify(conditions),
      viviComputedExpression: buildJexlExpressionFromConditions(conditions, options?.parameterCatalog)
    }
  };
}

export function buildTraccarComputedAttributePayloadFromLibrary(
  row: NotificationRow,
  _scope?: TraccarScopedSyncContext,
  options?: LibraryTraccarSyncOptions
): TraccarComputedAttributeWritePayload {
  const description = String(row.description ?? "").trim();
  const eventId = String(row.eventId ?? "").trim();
  const bindingId = toNotificationLibraryBindingId(row);
  const fuelCompute = buildMergedFuelComputeConfig(row, options?.deviceBinding ?? null);
  const isFuelCompute = fuelCompute != null;
  const expression =
    buildFuelComputeExpressionFromDevice(row, options?.deviceBinding ?? null, options?.parameterCatalog) ??
    buildComputedAttributeExpressionFromLibrary(
      row,
      options?.parameterCatalog,
      options?.deviceBinding ?? null
    );
  const computedType = resolveComputedAttributeTypeFromLibrary(row, options?.parameterCatalog);
  const tenantId = options?.tenantId ?? "";
  const attribute = isFuelCompute
    ? buildFuelComputeOutputKey(row)
    : toComputedAttributeKey(eventId || bindingId);

  return {
    description: description || bindingId,
    attribute,
    expression,
    type: computedType,
    priority: isFuelCompute ? 1 : 0,
    attributes: {
      viviLibraryId: bindingId,
      viviSource: "notification-library",
      viviBindingId: bindingId,
      ...(tenantId ? { viviTenantId: tenantId } : {}),
      ...(eventId ? { viviEventId: eventId } : {}),
      ...(isFuelCompute ? { viviComputeKind: "fuel-level" } : {}),
      viviConfig: JSON.stringify({
        description,
        eventId,
        type: row.type,
        availability: row.availability,
        notificationVideo: row.notificationVideo ?? null,
        parameters: row.parameters ?? null
      }),
      viviComputedExpression: expression
    }
  };
}

function readViviLibraryId(item: { attributes?: Record<string, unknown>; description?: string } | null | undefined): string {
  const attrs = item?.attributes;
  if (attrs && typeof attrs === "object") {
    const fromAttrs = String((attrs as any).viviLibraryId ?? "").trim();
    if (fromAttrs) return fromAttrs;
  }
  return readViviLibraryIdFromComputedItem(item);
}

function readComputedAttributeKey(item: TraccarComputedAttribute | null | undefined): string {
  return String(item?.attribute ?? "").trim();
}

function isAvailable(row: NotificationRow): boolean {
  return normalizeKey(String(row.availability ?? "")) === "available";
}

function positiveId(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isUselessComputedExpression(expression: string): boolean {
  const expr = String(expression ?? "").trim().toLowerCase();
  return !expr || expr === "null";
}

/** Whether this library row should create/update a Traccar computed attribute. */
export function libraryRowNeedsComputedAttribute(
  row: NotificationRow,
  options?: LibraryTraccarSyncOptions
): boolean {
  if (isActiveOnlyFuelNotificationDescription(row.description)) return false;
  if (isFuelComputeNotification(row)) return true;
  const payload = buildTraccarComputedAttributePayloadFromLibrary(row, undefined, options);
  return !isUselessComputedExpression(payload.expression);
}

async function loadNotificationsCatalog(options?: LibraryTraccarSyncOptions): Promise<TraccarNotification[]> {
  if (Array.isArray(options?.notificationsCatalog)) return options!.notificationsCatalog!;
  return getTraccarNotifications();
}

async function loadComputedAttributesCatalog(
  options?: LibraryTraccarSyncOptions
): Promise<TraccarComputedAttribute[]> {
  if (Array.isArray(options?.computedAttributesCatalog)) return options!.computedAttributesCatalog!;
  return getTraccarComputedAttributes();
}

function findTraccarNotificationInCatalog(
  items: TraccarNotification[],
  libraryId: string,
  tenantId?: string
): TraccarNotification | null {
  const matches = items.filter((item) => readViviLibraryId(item) === libraryId);
  const scopedTenant = String(tenantId ?? "").trim();
  if (!scopedTenant) return matches[0] ?? null;
  return matches.find((item) => readTraccarItemTenantId(item) === scopedTenant) ?? null;
}

function findTraccarComputedAttributeInCatalog(
  items: TraccarComputedAttribute[],
  row: NotificationRow,
  attributeKey: string,
  tenantId?: string
): TraccarComputedAttribute | null {
  const libraryId = toNotificationLibraryBindingId(row);
  const libraryMatches = items.filter((item) => readViviLibraryId(item) === libraryId);
  const scopedTenant = String(tenantId ?? "").trim();
  const byLibraryId = scopedTenant
    ? libraryMatches.find((item) => readTraccarItemTenantId(item) === scopedTenant)
    : libraryMatches[0];
  if (byLibraryId) return byLibraryId;
  const byMatch = items.find((item) => traccarItemMatchesLibraryRow(item, row, tenantId));
  if (byMatch) return byMatch;
  const keyMatches = items.filter((item) => readComputedAttributeKey(item) === attributeKey);
  if (!scopedTenant) return keyMatches[0] ?? null;
  return keyMatches.find((item) => readTraccarItemTenantId(item) === scopedTenant) ?? null;
}

async function findTraccarNotificationByLibraryId(
  libraryId: string,
  options?: LibraryTraccarSyncOptions
) {
  const items = await loadNotificationsCatalog(options);
  return findTraccarNotificationInCatalog(items, libraryId, options?.tenantId);
}

async function findTraccarComputedAttributeForLibraryRow(
  row: NotificationRow,
  attributeKey: string,
  tenantId?: string,
  options?: LibraryTraccarSyncOptions
) {
  const items = await loadComputedAttributesCatalog(options);
  return findTraccarComputedAttributeInCatalog(items, row, attributeKey, tenantId);
}

export type LibraryTraccarSyncResult = {
  ok: boolean;
  notificationOk: boolean;
  computedOk: boolean;
  error?: string;
  /** True when a computed attribute was intentionally not written. */
  computedSkipped?: boolean;
  traccarNotificationId?: number | null;
  traccarComputedAttributeId?: number | null;
};

async function removeDuplicateTraccarNotifications(
  row: NotificationRow,
  libraryId: string,
  keepId: number,
  options?: LibraryTraccarSyncOptions
): Promise<void> {
  const tenantId = String(options?.tenantId ?? "").trim();
  const items = await loadNotificationsCatalog(options);
  const extras = items.filter((item) => {
    const id = positiveId(item.id);
    if (!id || id === keepId) return false;
    if (!traccarItemMatchesLibraryRow(item, row, tenantId || undefined) && readViviLibraryId(item) !== libraryId) {
      return false;
    }
    if (tenantId) {
      const itemTenant = readTraccarItemTenantId(item);
      if (itemTenant && itemTenant !== tenantId) return false;
    }
    return true;
  });
  for (const item of extras) {
    const id = positiveId(item.id);
    if (!id) continue;
    await deleteTraccarNotification(id).catch(() => undefined);
  }
  if (extras.length && Array.isArray(options?.notificationsCatalog)) {
    // Drop deleted ids from the in-batch catalog so later syncs do not re-pick them.
    const deleted = new Set(extras.map((item) => positiveId(item.id)).filter((id): id is number => Boolean(id)));
    options!.notificationsCatalog = options!.notificationsCatalog.filter((item) => {
      const id = positiveId(item.id);
      return !id || !deleted.has(id);
    });
  }
}

async function removeDuplicateTraccarComputedAttributes(
  row: NotificationRow,
  attributeKey: string,
  keepId: number,
  tenantId: string,
  options?: LibraryTraccarSyncOptions
): Promise<void> {
  const items = await loadComputedAttributesCatalog(options);
  const libraryId = toNotificationLibraryBindingId(row);
  const extras = items.filter((item) => {
    const id = positiveId(item.id);
    if (!id || id === keepId) return false;
    // Same library row (or same attribute key for that row) = duplicate from a prior sync.
    const sameLibrary =
      readViviLibraryId(item) === libraryId || traccarItemMatchesLibraryRow(item, row, tenantId);
    const sameAttributeKey =
      readComputedAttributeKey(item) === String(attributeKey ?? "").trim() && sameLibrary;
    if (!sameLibrary && !sameAttributeKey) return false;
    if (tenantId) {
      const itemTenant = readTraccarItemTenantId(item);
      if (itemTenant && itemTenant !== tenantId) return false;
    }
    return true;
  });
  for (const item of extras) {
    const id = positiveId(item.id);
    if (!id) continue;
    await deleteTraccarComputedAttribute(id).catch(() => undefined);
  }
  if (extras.length && Array.isArray(options?.computedAttributesCatalog)) {
    const deleted = new Set(extras.map((item) => positiveId(item.id)).filter((id): id is number => Boolean(id)));
    options!.computedAttributesCatalog = options!.computedAttributesCatalog.filter((item) => {
      const id = positiveId(item.id);
      return !id || !deleted.has(id);
    });
  }
}

async function upsertTraccarNotification(
  row: NotificationRow,
  libraryId: string,
  payload: TraccarNotificationWritePayload,
  options?: LibraryTraccarSyncOptions
): Promise<{ ok: boolean; id: number | null; error?: string }> {
  const storedId = positiveId(row.traccarNotificationId);
  if (storedId) {
    const result = await updateTraccarNotification(storedId, payload);
    if (result.ok) {
      const id = positiveId(result.body?.id) ?? storedId;
      await removeDuplicateTraccarNotifications(row, libraryId, id, options);
      return { ok: true, id };
    }
    if (result.status !== 404) {
      return { ok: false, id: storedId, error: result.error };
    }
  }

  const existing =
    (await findTraccarNotificationByLibraryId(libraryId, options)) ??
    (await loadNotificationsCatalog(options)).find((item) => traccarItemMatchesLibraryRow(item, row, options?.tenantId)) ??
    null;
  const existingId = positiveId(existing?.id);
  if (existingId) {
    const result = await updateTraccarNotification(existingId, payload);
    if (result.ok) {
      const id = positiveId(result.body?.id) ?? existingId;
      await removeDuplicateTraccarNotifications(row, libraryId, id, options);
      return { ok: true, id };
    }
    return {
      ok: false,
      id: existingId,
      error: result.error
    };
  }

  const created = await createTraccarNotification(payload);
  if (created.ok) {
    const id = positiveId(created.body?.id);
    if (id) await removeDuplicateTraccarNotifications(row, libraryId, id, options);
    return { ok: true, id };
  }
  return {
    ok: false,
    id: null,
    error: created.error
  };
}

async function upsertTraccarComputedAttribute(
  row: NotificationRow,
  payload: TraccarComputedAttributeWritePayload,
  tenantId: string,
  options?: LibraryTraccarSyncOptions
): Promise<{ ok: boolean; id: number | null; error?: string }> {
  const storedId = positiveId(row.traccarComputedAttributeId);
  if (storedId) {
    const result = await updateTraccarComputedAttribute(storedId, { ...payload, id: storedId });
    if (result.ok) {
      const id = positiveId(result.body?.id) ?? storedId;
      await removeDuplicateTraccarComputedAttributes(row, payload.attribute, id, tenantId, options);
      return { ok: true, id };
    }
    if (result.status !== 404) {
      return { ok: false, id: storedId, error: result.error };
    }
  }

  const existing = await findTraccarComputedAttributeForLibraryRow(
    row,
    payload.attribute,
    tenantId,
    options
  );
  const existingId = positiveId(existing?.id);
  if (existingId) {
    const result = await updateTraccarComputedAttribute(existingId, { ...payload, id: existingId });
    if (result.ok) {
      const id = positiveId(result.body?.id) ?? existingId;
      await removeDuplicateTraccarComputedAttributes(row, payload.attribute, id, tenantId, options);
      return { ok: true, id };
    }
    return {
      ok: false,
      id: existingId,
      error: result.error
    };
  }

  const created = await createTraccarComputedAttribute(payload);
  if (created.ok) {
    const id = positiveId(created.body?.id);
    if (id) await removeDuplicateTraccarComputedAttributes(row, payload.attribute, id, tenantId, options);
    return { ok: true, id };
  }
  return {
    ok: false,
    id: null,
    error: created.error
  };
}

export async function syncNotificationLibraryItemToTraccar(
  row: NotificationRow,
  options?: LibraryTraccarSyncOptions
): Promise<LibraryTraccarSyncResult> {
  const tenantId = options?.tenantId ?? readActiveTenantId();
  if (!tenantId || !isDatabaseTenant(tenantId)) {
    return { ok: false, notificationOk: false, computedOk: false, error: "Select a database before syncing to VIVI." };
  }

  // UK GPS IoT: notifications stay in site library + bindings; GetEvents / GetTelemetry
  // supply event ids and history. Never create Traccar notification duplicates.
  if (isGpsIotServer()) {
    return {
      ok: true,
      notificationOk: true,
      computedOk: true,
      computedSkipped: true,
      traccarNotificationId: positiveId(row.traccarNotificationId),
      traccarComputedAttributeId: positiveId(row.traccarComputedAttributeId)
    };
  }

  const syncOptions: LibraryTraccarSyncOptions = { ...options, tenantId };
  const libraryId = toNotificationLibraryBindingId(row);
  const available = isAvailable(row);

  if (!available) {
    const removed = await deleteNotificationLibraryItemFromTraccar(row, syncOptions);
    return {
      ...removed,
      traccarNotificationId: null,
      traccarComputedAttributeId: null
    };
  }

  const notificationPayload = buildTraccarNotificationPayloadFromLibrary(row, libraryId, undefined, syncOptions);
  const computedPayload = buildTraccarComputedAttributePayloadFromLibrary(row, undefined, syncOptions);
  const activeOnlyFuel = isActiveOnlyFuelNotificationDescription(row.description);
  const fuelComputeOnly = isFuelComputeNotification(row);
  const fuelNeedsDevice = fuelComputeOnly && !fuelComputeReadyFromDevice(row, syncOptions.deviceBinding ?? null);
  const needsComputed = libraryRowNeedsComputedAttribute(row, syncOptions);

  let notificationOk = false;
  let computedOk = false;
  let computedSkipped = false;
  let error = "";
  let traccarNotificationId: number | null = positiveId(row.traccarNotificationId);
  let traccarComputedAttributeId: number | null = positiveId(row.traccarComputedAttributeId);

  if (!fuelComputeOnly) {
    try {
      const result = await upsertTraccarNotification(row, libraryId, notificationPayload, syncOptions);
      notificationOk = result.ok;
      if (result.ok) traccarNotificationId = result.id;
      if (!result.ok) error = result.error || error;
    } catch (err: any) {
      error = String(err?.message ?? err);
    }
  } else {
    notificationOk = true;
    traccarNotificationId = null;
    try {
      const storedId = positiveId(row.traccarNotificationId);
      if (storedId) {
        await deleteTraccarNotification(storedId);
      } else {
        const existingNotification = await findTraccarNotificationByLibraryId(libraryId, syncOptions);
        const id = positiveId(existingNotification?.id);
        if (id) await deleteTraccarNotification(id);
      }
    } catch {
      // Fuel compute entries only publish a computed attribute.
    }
  }

  if (activeOnlyFuel) {
    computedOk = true;
    computedSkipped = true;
    traccarComputedAttributeId = null;
    try {
      const storedId = positiveId(row.traccarComputedAttributeId);
      if (storedId) {
        await deleteTraccarComputedAttribute(storedId);
      } else {
        const existingComputed = await findTraccarComputedAttributeForLibraryRow(
          row,
          computedPayload.attribute,
          tenantId,
          syncOptions
        );
        const id = positiveId(existingComputed?.id);
        if (id) await deleteTraccarComputedAttribute(id);
      }
    } catch {
      // Native fuel events do not use computed attributes.
    }
  } else if (fuelNeedsDevice) {
    computedOk = false;
    error =
      describeMissingFuelComputePrerequisites(row, syncOptions.deviceBinding ?? null) ||
      "Connect Fuel on the device binding with IO input, Max capacity (L), and Max mV, then compile the configuration group.";
  } else if (!needsComputed) {
    computedOk = true;
    computedSkipped = true;
    traccarComputedAttributeId = null;
    // Only clean stale attrs when we already know an id or have a prefetched catalog (no extra GET).
    try {
      const storedId = positiveId(row.traccarComputedAttributeId);
      if (storedId) {
        await deleteTraccarComputedAttribute(storedId);
      } else if (Array.isArray(syncOptions.computedAttributesCatalog)) {
        const existingComputed = findTraccarComputedAttributeInCatalog(
          syncOptions.computedAttributesCatalog,
          row,
          computedPayload.attribute,
          tenantId
        );
        const id = positiveId(existingComputed?.id);
        if (id) await deleteTraccarComputedAttribute(id);
      }
    } catch {
      // Best-effort cleanup only.
    }
  } else {
    try {
      const result = await upsertTraccarComputedAttribute(row, computedPayload, tenantId, syncOptions);
      computedOk = result.ok;
      if (result.ok) traccarComputedAttributeId = result.id;
      if (!result.ok) error = result.error || error;
    } catch (err: any) {
      computedOk = false;
      error = error || String(err?.message ?? err);
    }
  }

  const ok = activeOnlyFuel
    ? notificationOk
    : fuelNeedsDevice
      ? false
      : notificationOk && computedOk;

  return {
    ok,
    notificationOk,
    computedOk,
    ...(computedSkipped ? { computedSkipped: true } : {}),
    traccarNotificationId,
    traccarComputedAttributeId,
    ...(error ? { error } : {})
  };
}

export async function deleteNotificationLibraryItemFromTraccar(
  row: NotificationRow,
  options?: LibraryTraccarSyncOptions
): Promise<LibraryTraccarSyncResult> {
  const libraryId = toNotificationLibraryBindingId(row);
  const tenantId = options?.tenantId ?? readActiveTenantId();
  const attributeKey = isFuelComputeNotification(row)
    ? buildFuelComputeOutputKey(row)
    : toComputedAttributeKey(String(row.eventId ?? "").trim() || libraryId);
  let notificationOk = true;
  let computedOk = true;
  let error = "";

  try {
    const storedId = positiveId(row.traccarNotificationId);
    if (storedId) {
      const result = await deleteTraccarNotification(storedId);
      notificationOk = result.ok || result.status === 404;
      if (!notificationOk) error = result.error || error;
    } else {
      const existingNotification = await findTraccarNotificationByLibraryId(libraryId, options);
      const traccarNotificationId = positiveId(existingNotification?.id);
      if (traccarNotificationId) {
        const result = await deleteTraccarNotification(traccarNotificationId);
        notificationOk = result.ok || result.status === 404;
        if (!notificationOk) error = result.error || error;
      }
    }
  } catch (err: any) {
    notificationOk = false;
    error = String(err?.message ?? err);
  }

  try {
    const storedId = positiveId(row.traccarComputedAttributeId);
    if (storedId) {
      const result = await deleteTraccarComputedAttribute(storedId);
      computedOk = result.ok || result.status === 404;
      if (!computedOk) error = result.error || error;
    } else {
      const existingComputed = await findTraccarComputedAttributeForLibraryRow(
        row,
        attributeKey,
        tenantId,
        options
      );
      const traccarComputedId = positiveId(existingComputed?.id);
      if (traccarComputedId) {
        const result = await deleteTraccarComputedAttribute(traccarComputedId);
        computedOk = result.ok || result.status === 404;
        if (!computedOk) error = result.error || error;
      }
    }
  } catch (err: any) {
    computedOk = false;
    error = error || String(err?.message ?? err);
  }

  return {
    ok: notificationOk && computedOk,
    notificationOk,
    computedOk,
    traccarNotificationId: null,
    traccarComputedAttributeId: null,
    ...(error ? { error } : {})
  };
}

/** Prefetch both catalogs once for a multi-item sync batch. */
export async function prefetchTraccarLibraryCatalogs(): Promise<{
  notifications: TraccarNotification[];
  computedAttributes: TraccarComputedAttribute[];
}> {
  const [notifications, computedAttributes] = await Promise.all([
    getTraccarNotifications(),
    getTraccarComputedAttributes()
  ]);
  return { notifications, computedAttributes };
}

export async function syncNotificationLibraryItemsToTraccar(rows: NotificationRow[]): Promise<{
  ok: boolean;
  synced: number;
  failed: number;
  errors: string[];
  results: LibraryTraccarSyncResult[];
}> {
  beginTraccarListCacheBatch();
  try {
    const catalogs = await prefetchTraccarLibraryCatalogs();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];
    const results: LibraryTraccarSyncResult[] = [];

    for (const row of rows) {
      const result = await syncNotificationLibraryItemToTraccar(row, {
        notificationsCatalog: catalogs.notifications,
        computedAttributesCatalog: catalogs.computedAttributes
      });
      results.push(result);
      if (result.ok) synced += 1;
      else {
        failed += 1;
        if (result.error) errors.push(`${row.description}: ${result.error}`);
      }
    }

    return { ok: failed === 0, synced, failed, errors, results };
  } finally {
    endTraccarListCacheBatch();
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    })
  );
  return results;
}
