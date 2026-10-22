import { describe, expect, it } from "vitest";
import { canAccessPage } from "./pageAccess";

const granted = (pagePath: string, view = true, edit = false, deleteFlag = false) => ({
  pagePath,
  view,
  edit,
  delete: deleteFlag
});

describe("canAccessPage", () => {
  it("hides Deliver and other unchecked pages even when the user is tenant Admin", () => {
    const input = {
      action: "view" as const,
      principalKind: "user",
      mode: "deny-by-default" as const,
      loaded: true,
      rows: [granted("/Track/fleet/assets", true, true, false)]
    };
    expect(canAccessPage({ ...input, pagePath: "/Track/fleet/assets" })).toBe(true);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/orders" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/drone-delivery" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/platform/super-admin" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Analyze/insights/reports" })).toBe(false);
  });

  it("does not treat one Deliver page as granting sibling subpages", () => {
    const input = {
      action: "view" as const,
      principalKind: "user",
      mode: "deny-by-default" as const,
      loaded: true,
      rows: [granted("/Deliver/orders")]
    };
    expect(canAccessPage({ ...input, pagePath: "/Deliver/orders" })).toBe(true);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/clients" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/scheduling" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/platform/customer" })).toBe(false);
  });

  it("denies the whole module when no pages in that module were selected", () => {
    const input = {
      action: "view" as const,
      principalKind: "user",
      mode: "deny-by-default" as const,
      loaded: true,
      rows: [granted("/Track/tracking/live"), granted("/Control/user-settings/personal-settings")]
    };
    expect(canAccessPage({ ...input, pagePath: "/Deliver/drone-delivery" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Analyze/insights/dashboards" })).toBe(false);
  });

  it("keeps platform admin unrestricted", () => {
    expect(
      canAccessPage({
        pagePath: "/Deliver/orders",
        action: "view",
        principalKind: "admin",
        mode: "allow-all",
        loaded: true,
        rows: []
      })
    ).toBe(true);
  });

  it("does not use investigator allow-all while impersonating", () => {
    expect(
      canAccessPage({
        pagePath: "/Deliver/orders",
        action: "view",
        principalKind: "admin",
        impersonating: true,
        mode: "allow-all",
        loaded: true,
        rows: [granted("/Track/fleet/assets")]
      })
    ).toBe(false);
  });

  it("does not open pages from a role name when that role has no checked pages", () => {
    const input = {
      action: "view" as const,
      principalKind: "user",
      impersonating: true,
      mode: "deny-by-default" as const,
      loaded: true,
      rows: [] as ReturnType<typeof granted>[],
      roleNames: ["Basic User"]
    };
    expect(canAccessPage({ ...input, pagePath: "/Track/overview/fleet" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Track/fleet/assets" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Track/tracking/live" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Control/user-admin/users" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/orders" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Analyze/insights/dashboards" })).toBe(false);
  });

  it("keeps an explicit matrix ahead of the role name", () => {
    expect(
      canAccessPage({
        pagePath: "/Deliver/orders",
        action: "view",
        principalKind: "user",
        mode: "deny-by-default",
        loaded: true,
        rows: [granted("/Track/fleet/assets")],
        roleNames: ["Admin"]
      })
    ).toBe(false);
  });

  it("does not open every page for an Admin or Advanced User name without those rights", () => {
    const input = {
      action: "view" as const,
      principalKind: "user",
      mode: "allow-all" as const,
      loaded: true,
      rows: [] as ReturnType<typeof granted>[],
      roleNames: ["Admin", "Advanced User", "Own Support"]
    };
    expect(canAccessPage({ ...input, pagePath: "/Track/fleet/drivers" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Analyze/insights/reports" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Deliver/orders" })).toBe(false);
    expect(canAccessPage({ ...input, pagePath: "/Control/user-admin/users" })).toBe(false);
  });

  it("hides pages until the role matrix has loaded", () => {
    expect(
      canAccessPage({
        pagePath: "/Deliver/orders",
        action: "view",
        principalKind: "user",
        mode: "not-loaded",
        loaded: false,
        rows: [granted("/Deliver/orders")]
      })
    ).toBe(false);
  });
});
