import { describe, expect, it } from "vitest";
import { CMSV6_ENDPOINTS, findCmsv6Endpoint, listCmsv6Groups } from "./catalog";

describe("cmsv6 catalog", () => {
  it("covers every documented web API group", () => {
    const groups = listCmsv6Groups();
    expect(groups).toEqual(expect.arrayContaining([
      "Login And Logout",
      "Query Vehicle",
      "Video Business",
      "File related business",
      "Active Safety Business",
      "Video 1078 Business",
      "Control Business",
      "Device Management",
      "Area Information",
      "Driver Management"
    ]));
    expect(CMSV6_ENDPOINTS.length).toBeGreaterThan(70);
    expect(findCmsv6Endpoint("login")?.action).toBe("StandardApiAction_login");
    expect(findCmsv6Endpoint("getDeviceStatus")?.title).toContain("GPS");
    expect(findCmsv6Endpoint("sendPTZControl")?.action).toBe("StandardApiAction_sendPTZControl");
  });
});
