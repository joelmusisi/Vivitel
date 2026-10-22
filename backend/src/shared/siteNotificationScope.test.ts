import { describe, expect, it } from "vitest";
import { bindingCoversSiteEvent, libraryNotificationIsAvailable, siteMonitorsNotification } from "./siteNotificationScope";
import { bindingHasExplicitRecipients, explicitAlertRecipients } from "./userAlertDispatch";

describe("site notification scope", () => {
  const mulu = { site: "MMULU COMPANY", monitoredEvents: ["Mulu Over Speeding"] };
  const demo = { site: "Demo", monitoredEvents: ["Mulu Over Speeding"] };

  it("keeps a notification on the site that monitors it", () => {
    expect(bindingCoversSiteEvent(mulu, "Mulu Over Speeding", "MMULU COMPANY")).toBe(true);
  });

  it("does not apply a site notification to another site's asset", () => {
    expect(bindingCoversSiteEvent(mulu, "Mulu Over Speeding", "Demo")).toBe(false);
    expect(siteMonitorsNotification([mulu], "Mulu Over Speeding", "Demo")).toBe(false);
  });

  it("does not apply when the asset has no site", () => {
    expect(bindingCoversSiteEvent(mulu, "Mulu Over Speeding", "")).toBe(false);
    expect(siteMonitorsNotification([demo], "Mulu Over Speeding", "Demo")).toBe(true);
  });

  it("uses only people added on the alert", () => {
    expect(bindingHasExplicitRecipients({ site: "Demo", monitoredEvents: ["Ignition on"] })).toBe(false);
    const selected = explicitAlertRecipients({
      emailRecipients: [{ id: "user-1", name: "Ada", email: "ada@example.com" }],
      pushRecipients: [{ id: "user-2", name: "Bea", email: "bea@example.com" }]
    });
    expect(selected.email.map((person) => person.email)).toEqual(["ada@example.com"]);
    expect(selected.push.map((person) => person.id)).toEqual(["user-2"]);
  });

  it("alerts only for library notifications that have been set available", () => {
    const items = [
      { description: "Ignition on", availability: "Available" },
      { description: "Over speeding", availability: "Unavailable" }
    ];
    expect(libraryNotificationIsAvailable(items, "Ignition on")).toBe(true);
    expect(libraryNotificationIsAvailable(items, "Over speeding")).toBe(false);
    expect(libraryNotificationIsAvailable(items, "Harsh braking")).toBe(false);
  });
});
