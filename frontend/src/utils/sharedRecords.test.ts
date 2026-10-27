import { describe, expect, it } from "vitest";
import { isSubscriptionRecord } from "./sharedRecords";

describe("isSubscriptionRecord", () => {
  it("keeps report and alert subscriptions on one account", () => {
    expect(isSubscriptionRecord("vivi.reports.subscriptions")).toBe(true);
    expect(isSubscriptionRecord("vivi.reports.contacts")).toBe(true);
    expect(isSubscriptionRecord("vivi:user-alert-rules")).toBe(true);
    expect(isSubscriptionRecord("infohub:stream-preferences")).toBe(true);
  });

  it("treats fleet, config, and asset records as shared", () => {
    expect(isSubscriptionRecord("control:config:Asset commissioning")).toBe(false);
    expect(isSubscriptionRecord("control:contacts")).toBe(false);
    expect(isSubscriptionRecord("track:live-tracking:custom-locations")).toBe(false);
    expect(isSubscriptionRecord("control:user-scoring")).toBe(false);
  });
});
