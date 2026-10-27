import type { LinkingOptions } from "@react-navigation/native";
import { DEEP_LINK_HOST, DEEP_LINK_SCHEME } from "../config";

/**
 * Deep links into VIVI Mobile.
 *
 * - Custom scheme:  vivimobile://map, vivimobile://assets, vivimobile://profile
 * - Android App Links / iOS Universal Links on https://us.vivitelematics.ca, reusing the
 *   web app's own paths so a shared web link opens the matching native screen. Only these
 *   paths are claimed by the OS (AndroidManifest.xml intent filters and the hosted
 *   apple-app-site-association file); every other web path keeps opening in the browser.
 */
export const linking: LinkingOptions<{}> = {
  prefixes: [`${DEEP_LINK_SCHEME}://`, `https://${DEEP_LINK_HOST}`],
  config: {
    screens: {
      Main: {
        screens: {
          Home: { path: "home", alias: ["mobile"] },
          Map: { path: "map", alias: ["Track/tracking/live"] },
          Assets: { path: "assets", alias: ["Track/fleet/assets"] },
          Profile: { path: "profile", alias: ["mobile/profile"] }
        }
      },
      Login: "login"
    }
  }
};

/** Path for a push payload's `screen` field (e.g. "map") — reuses the linking table. */
export function deepLinkForScreen(screen: string): string | null {
  const key = String(screen ?? "").trim().toLowerCase();
  const known = ["home", "map", "assets", "profile"];
  return known.includes(key) ? `${DEEP_LINK_SCHEME}://${key}` : null;
}
