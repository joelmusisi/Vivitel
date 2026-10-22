import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateSiteContext,
  activateTenantContext,
  clearSelectionClientState,
  clearSessionClientState,
  registerSessionCacheFlusher
} from "./tenantContext";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear()
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: store
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: store,
      dispatchEvent: vi.fn()
    }
  });
});

describe("clearSelectionClientState", () => {
  it("drops site and hierarchy selection left by a previous login", () => {
    memory.set("vivi.activeSite", "WJL");
    memory.set("vivi.activeSiteId", "wjl-id");
    memory.set("vivi.selectedPath", "EAST AFRICA / AFRICA / TRANSFLEET / WJL");
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.org.dealers", "[]");

    clearSelectionClientState();

    expect(memory.get("vivi.activeSite")).toBeUndefined();
    expect(memory.get("vivi.activeSiteId")).toBeUndefined();
    expect(memory.get("vivi.selectedPath")).toBeUndefined();
    expect(memory.get("vivi.selectedScope")).toBeUndefined();
    expect(memory.get("vivi.org.dealers")).toBeUndefined();
  });
});

describe("clearSessionClientState", () => {
  it("clears selection and site UI for the next login", () => {
    memory.set("vivi.tenantId", "dealer-a:org-1:db-1");
    memory.set("vivi.activeSite", "WJL");
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.lockedAsset", "UA 1");
    memory.set("vivi.home.dashboard.model.v1", "{}");
    const flush = vi.fn();
    registerSessionCacheFlusher(flush);

    clearSessionClientState("dealer-a:org-1:db-1");

    expect(memory.get("vivi.activeSite")).toBeUndefined();
    expect(memory.get("vivi.selectedScope")).toBeUndefined();
    expect(memory.get("vivi.lockedAsset")).toBeUndefined();
    expect(memory.get("vivi.home.dashboard.model.v1")).toBeUndefined();
    expect(flush).toHaveBeenCalled();
  });
});

describe("activateTenantContext", () => {
  it("clears site UI but keeps ribbon selection keys for the caller to rewrite", () => {
    memory.set("vivi.tenantId", "dealer-a:org-1:db-1");
    memory.set("vivi.activeSite", "WJL");
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.activeDealerId", "dealer-b");
    memory.set("vivi.lockedAsset", "UA 1");

    activateTenantContext("dealer-b:org-2:db-2");

    expect(memory.get("vivi.lockedAsset")).toBeUndefined();
    expect(memory.get("vivi.activeDealerId")).toBe("dealer-b");
    expect(memory.get("vivi.activeSite")).toBe("WJL");
  });
});

describe("activateSiteContext", () => {
  it("clears previous site UI and notifies listeners without a refresh", () => {
    memory.set("vivi.activeSite", "WJL");
    memory.set("vivi.lockedAsset", "UA 1");
    memory.set("vivi.home.dashboard.model.v1", "{}");
    memory.set("vivi.liveTracking.selectedEvents", "[]");
    const flush = vi.fn();
    registerSessionCacheFlusher(flush);

    activateSiteContext("WJL", "Sten Yard");

    expect(memory.get("vivi.lockedAsset")).toBeUndefined();
    expect(memory.get("vivi.home.dashboard.model.v1")).toBeUndefined();
    expect(memory.get("vivi.liveTracking.selectedEvents")).toBeUndefined();
    expect(flush).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});
