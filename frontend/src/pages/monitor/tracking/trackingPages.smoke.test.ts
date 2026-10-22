import { describe, expect, it } from "vitest";

/**
 * Smoke-import modules that previously circular-inited and TDZ-crashed
 * production tracking route chunks (`Cannot access 'Ht' before initialization`).
 */
describe("tracking TDZ regression guards", () => {
  it("initializes saveFeedback exports", async () => {
    const mod = await import("../../../utils/saveFeedback");
    expect(mod.REQUIRED_MISSING_CLASS).toBe("vivi-required-missing");
    expect(typeof mod.beginSaving).toBe("function");
    expect(typeof mod.endSavingError).toBe("function");
  });

  it("initializes toast + saveFeedback together (former cycle)", async () => {
    const [toast, saveFeedback] = await Promise.all([
      import("../../../utils/toast"),
      import("../../../utils/saveFeedback")
    ]);
    expect(typeof toast.showToast).toBe("function");
    expect(saveFeedback.REQUIRED_MISSING_CLASS).toBeTruthy();
  });

  it("initializes notificationLibraryStore without locationAlert cycle crash", async () => {
    const mod = await import("../../../utils/notificationLibraryStore");
    expect(typeof mod.loadBoundNotificationOptionsForSite).toBe("function");
    expect(typeof mod.readActiveSiteName).toBe("function");
  });

  it("initializes locationAlertNotifications after notificationLibraryStore", async () => {
    await import("../../../utils/notificationLibraryStore");
    const mod = await import("../../../utils/locationAlertNotifications");
    expect(typeof mod.loadLocationAlertNotificationOptions).toBe("function");
    expect(mod.LOCATION_ALERTS_UPDATED_EVENT).toBeTruthy();
  });

  it("loads Control Road Hazards page module", async () => {
    const mod = await import("./ManageRoadHazards");
    expect(typeof mod.default).toBe("function");
  });
});
