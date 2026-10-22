import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NotificationRow } from "../data/notificationLibrary";
import { FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION } from "../data/notificationLibrary";

const apiMocks = vi.hoisted(() => ({
  createTraccarComputedAttribute: vi.fn(async (_payload?: unknown) => ({ ok: true, body: { id: 91 } })),
  updateTraccarComputedAttribute: vi.fn(async () => ({ ok: true, body: { id: 91 } })),
  getTraccarComputedAttributes: vi.fn(async () => []),
  getTraccarNotifications: vi.fn(async () => []),
  createTraccarNotification: vi.fn(async () => ({ ok: true, body: { id: 55 } })),
  updateTraccarNotification: vi.fn(
    async (): Promise<{ ok: boolean; body?: { id: number }; status?: number; error?: string }> => ({
      ok: true,
      body: { id: 55 }
    })
  ),
  deleteTraccarComputedAttribute: vi.fn(async () => ({ ok: true })),
  deleteTraccarNotification: vi.fn(async () => ({ ok: true })),
  beginTraccarListCacheBatch: vi.fn(),
  endTraccarListCacheBatch: vi.fn()
}));

vi.mock("./api", () => apiMocks);

vi.mock("./tenantContext", () => ({
  readActiveTenantId: () => "dealer:org:db",
  isDatabaseTenant: () => true
}));

import {
  libraryRowNeedsComputedAttribute,
  syncNotificationLibraryItemToTraccar
} from "./traccarNotificationLibrarySync";

const fuelRow: NotificationRow = {
  description: FUEL_LEVEL_COMPUTE_NOTIFICATION_DESCRIPTION,
  type: "Computed",
  availability: "Available",
  eventId: "fuel-level-computed",
  parameters: {
    fuelCompute: {
      enabled: true,
      tankCapacity: "400",
      scale: "75",
      outputAttribute: "fuelLevel"
    }
  }
};

const deviceBinding = {
  lines: [
    {
      id: "fuel",
      connected: true,
      analogInput: "IO6",
      analogMvMin: "0",
      analogMvMax: "3000",
      tankCapacityMin: "0",
      tankCapacityMax: "420",
      fuelScale: "70"
    }
  ]
};

const simpleAlarmRow: NotificationRow = {
  description: "Panic Alert",
  type: "Custom",
  availability: "Available",
  eventId: "panic-1",
  parameters: {
    conditions: [{ id: 1, field: "Panic Alert", operator: "is", value: "true" }],
    returnValue: { param: "No return value", mode: "Maximum" }
  }
};

describe("syncNotificationLibraryItemToTraccar fuel compute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates or updates the fuelLevel computed attribute when device fuel line is configured", async () => {
    const result = await syncNotificationLibraryItemToTraccar(fuelRow, { deviceBinding });
    expect(result.computedOk).toBe(true);
    expect(apiMocks.createTraccarComputedAttribute).toHaveBeenCalled();
    const payload = apiMocks.createTraccarComputedAttribute.mock.calls[0]?.[0] as
      | { attribute?: string; expression?: string }
      | undefined;
    expect(payload?.attribute).toBe("fuelLevel");
    expect(String(payload?.expression)).toContain("io6");
    expect(String(payload?.expression)).toBe("((420 * io6) / 3000)");
    expect(result.traccarComputedAttributeId).toBe(91);
  });

  it("reports an error when fuel device line is missing", async () => {
    const result = await syncNotificationLibraryItemToTraccar(fuelRow, { deviceBinding: { lines: [] } });
    expect(result.computedOk).toBe(false);
    expect(result.error).toMatch(/device binding/i);
    expect(apiMocks.createTraccarComputedAttribute).not.toHaveBeenCalled();
  });
});

describe("syncNotificationLibraryItemToTraccar performance paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUTs by cached traccarNotificationId without listing notifications", async () => {
    apiMocks.updateTraccarNotification.mockResolvedValueOnce({ ok: true, body: { id: 42 } });
    const row: NotificationRow = {
      ...simpleAlarmRow,
      traccarNotificationId: 42,
      parameters: {
        conditions: [],
        returnValue: { param: "No return value", mode: "Maximum" }
      }
    };

    const result = await syncNotificationLibraryItemToTraccar(row, {
      notificationsCatalog: [],
      computedAttributesCatalog: []
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.updateTraccarNotification).toHaveBeenCalledWith(42, expect.any(Object));
    expect(apiMocks.getTraccarNotifications).not.toHaveBeenCalled();
    expect(apiMocks.createTraccarComputedAttribute).not.toHaveBeenCalled();
    expect(apiMocks.updateTraccarComputedAttribute).not.toHaveBeenCalled();
    expect(result.computedSkipped).toBe(true);
    expect(result.traccarNotificationId).toBe(42);
  });

  it("falls back to POST when cached notification id returns 404", async () => {
    apiMocks.updateTraccarNotification.mockResolvedValueOnce({ ok: false, status: 404, error: "Not found" });
    apiMocks.createTraccarNotification.mockResolvedValueOnce({ ok: true, body: { id: 77 } });

    const row: NotificationRow = {
      ...simpleAlarmRow,
      traccarNotificationId: 42,
      parameters: {
        conditions: [],
        returnValue: { param: "No return value", mode: "Maximum" }
      }
    };

    const result = await syncNotificationLibraryItemToTraccar(row, {
      notificationsCatalog: [],
      computedAttributesCatalog: []
    });

    expect(result.ok).toBe(true);
    expect(apiMocks.createTraccarNotification).toHaveBeenCalled();
    expect(result.traccarNotificationId).toBe(77);
  });

  it("libraryRowNeedsComputedAttribute is false for empty condition events", () => {
    expect(
      libraryRowNeedsComputedAttribute({
        description: "Custom beep",
        type: "Custom",
        availability: "Available",
        parameters: {
          conditions: [],
          returnValue: { param: "No return value", mode: "Maximum" }
        }
      })
    ).toBe(false);
  });

  it("libraryRowNeedsComputedAttribute is true for fuel compute", () => {
    expect(libraryRowNeedsComputedAttribute(fuelRow, { deviceBinding })).toBe(true);
  });
});
