import { beforeEach, describe, expect, it } from "vitest";
import {
  isCms808Server,
  isGpsIotServer,
  isTraccarOnlyServer,
  readActiveRegion,
  rememberActiveRegion
} from "./regionServers";

const installWindow = (hostname: string) => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
  (globalThis as any).window = { localStorage, location: { hostname } };
  (globalThis as any).localStorage = localStorage;
};

describe("local server region", () => {
  beforeEach(() => {
    installWindow("127.0.0.1");
  });

  it("keeps localhost on the United States server until a server is chosen", () => {
    expect(readActiveRegion()).toBe("us");
    expect(isCms808Server()).toBe(false);
    expect(isGpsIotServer()).toBe(false);
    expect(isTraccarOnlyServer()).toBe(false);
  });

  it("opens the chosen server on localhost instead of the United States server", () => {
    rememberActiveRegion("za");
    expect(readActiveRegion()).toBe("za");
    expect(isCms808Server()).toBe(true);
    expect(isTraccarOnlyServer()).toBe(false);

    rememberActiveRegion("uk");
    expect(readActiveRegion()).toBe("uk");
    expect(isGpsIotServer()).toBe(true);
    expect(isCms808Server()).toBe(false);
  });

  it("lets a regional host win over a remembered local server", () => {
    rememberActiveRegion("za");
    (globalThis as any).window.location = { hostname: "us.vivitelematics.ca" };
    expect(readActiveRegion()).toBe("us");
    expect(isCms808Server()).toBe(false);
    expect(isTraccarOnlyServer()).toBe(true);
  });
});
