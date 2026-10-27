import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST_LOGIN_PATH_KEY } from "./phoneMode";
import { clearSessionClientState, restoreSessionResume, saveSessionResume } from "./tenantContext";

// Minimal browser storage (no jsdom in this project).
class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}
vi.stubGlobal("window", { localStorage: new MemoryStorage(), dispatchEvent: () => true });

const signIn = (userId: string) =>
  window.localStorage.setItem("vivi.auth.principal", JSON.stringify({ userId, email: `${userId}@example.com` }));

const pickSite = () => {
  window.localStorage.setItem("vivi.selectedPath", "Dealer / Org / DB / Site A");
  window.localStorage.setItem("vivi.selectedScope", "site");
  window.localStorage.setItem("vivi.activeSite", "Site A");
  window.localStorage.setItem("vivi.activeDbId", "db-1");
  window.localStorage.setItem(POST_LOGIN_PATH_KEY, "/Track/tracking/live");
};

describe("session resume after logout", () => {
  beforeEach(() => window.localStorage.clear());

  it("brings the same account back to its hierarchy and page", () => {
    signIn("u1");
    pickSite();
    clearSessionClientState("t1");
    expect(window.localStorage.getItem("vivi.selectedPath")).toBeNull();

    restoreSessionResume(true, "u1");
    expect(window.localStorage.getItem("vivi.selectedPath")).toBe("Dealer / Org / DB / Site A");
    expect(window.localStorage.getItem("vivi.activeSite")).toBe("Site A");
    expect(window.localStorage.getItem(POST_LOGIN_PATH_KEY)).toBe("/Track/tracking/live");
  });

  it("does not hand another account the previous user's page or site", () => {
    signIn("u1");
    pickSite();
    clearSessionClientState("t1");

    restoreSessionResume(false, "u2");
    expect(window.localStorage.getItem("vivi.selectedPath")).toBeNull();
    expect(window.localStorage.getItem(POST_LOGIN_PATH_KEY)).toBeNull();
  });

  it("never overwrites a saved selection with an empty one", () => {
    signIn("u1");
    pickSite();
    saveSessionResume();
    clearSessionClientState("t1"); // selection already cleared → nothing new to save
    saveSessionResume();

    restoreSessionResume(true, "u1");
    expect(window.localStorage.getItem("vivi.selectedPath")).toBe("Dealer / Org / DB / Site A");
  });
});
