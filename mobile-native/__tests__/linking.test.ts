import { getStateFromPath } from "@react-navigation/native";
import { deepLinkForScreen, linking } from "../src/navigation/linking";

jest.mock("@react-native-firebase/messaging", () => ({}));
jest.mock("../src/api/client", () => ({ apiFetch: jest.fn(), ApiError: class extends Error {} }));

/** Name of the tab a path resolves to (Main > tab). */
function tabFor(path: string): string | undefined {
  const state = getStateFromPath(path, linking.config as any);
  const main = state?.routes[0];
  return main?.name === "Main" ? main.state?.routes[0]?.name : main?.name;
}

describe("deep link routing", () => {
  test.each([
    ["/Track/tracking/live", "Map"],
    ["/Track/fleet/assets", "Assets"],
    ["/mobile", "Home"],
    ["/mobile/profile", "Profile"],
    ["/map", "Map"],
    ["/assets", "Assets"],
    ["/home", "Home"],
    ["/profile", "Profile"]
  ])("%s opens the %s tab", (path, tab) => {
    expect(tabFor(path)).toBe(tab);
  });

  test("custom scheme and web host are both accepted", () => {
    expect(linking.prefixes).toEqual(["vivimobile://", "https://us.vivitelematics.ca"]);
  });

  test("push payload screen names map to app links", () => {
    expect(deepLinkForScreen("Map")).toBe("vivimobile://map");
    expect(deepLinkForScreen("reports")).toBeNull();
  });
});

describe("notification links", () => {
  const { linkFromNotification } = require("../src/notifications/push");

  test("prefers an explicit url", () => {
    expect(linkFromNotification({ data: { url: "https://us.vivitelematics.ca/Track/tracking/live", screen: "assets" } })).toBe(
      "https://us.vivitelematics.ca/Track/tracking/live"
    );
  });

  test("falls back to the screen field", () => {
    expect(linkFromNotification({ data: { screen: "assets" } })).toBe("vivimobile://assets");
  });

  test("ignores notifications without a target", () => {
    expect(linkFromNotification({ data: {} })).toBeNull();
    expect(linkFromNotification(null)).toBeNull();
  });
});
