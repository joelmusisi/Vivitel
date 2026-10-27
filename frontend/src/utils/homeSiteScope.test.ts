import { beforeEach, describe, expect, it } from "vitest";
import { readHomeSiteScope } from "./homeSiteScope";

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
    value: { localStorage: store }
  });
});

describe("readHomeSiteScope", () => {
  it("rejects a leftover site from another account when principal sites are known", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.activeSite", "WJL");
    memory.set(
      "vivi.auth.principal",
      JSON.stringify({
        principal: { kind: "user", siteNames: ["Sten Yard"] }
      })
    );

    const scope = readHomeSiteScope();
    expect(scope.siteLabel).toBe("Sten Yard");
    expect(scope.scopedSites).toEqual(["Sten Yard"]);
    expect(scope.ready).toBe(true);
  });

  it("keeps the active site when it matches the principal assignment", () => {
    memory.set("vivi.selectedScope", "site");
    memory.set("vivi.activeSite", "Sten Yard");
    memory.set(
      "vivi.auth.principal",
      JSON.stringify({
        principal: { kind: "user", siteNames: ["Sten Yard"] }
      })
    );

    expect(readHomeSiteScope().siteLabel).toBe("Sten Yard");
  });
});
