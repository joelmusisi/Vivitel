import { AnalyzeNav, ControlNav, DeliverNav, TrackNav, type NavItem, type NavLinkItem } from "../navData";
import { canForPath } from "../utils/api";

export type MobileNavTab = {
  id: string;
  label: string;
  path: string;
  icon: "home" | "map" | "preview" | "profile";
};

const TAB_DEFS: MobileNavTab[] = [
  { id: "home", label: "Home", path: "/", icon: "home" },
  { id: "map", label: "Map", path: "/Track/tracking/live", icon: "map" },
  { id: "preview", label: "Trips", path: "/mobile/preview", icon: "preview" },
  { id: "profile", label: "Profile", path: "/mobile/profile", icon: "profile" }
];

export function mobileTabsForUser(): MobileNavTab[] {
  return TAB_DEFS.filter(
    (tab) => tab.id === "profile" || tab.id === "preview" || canForPath(tab.path, "view")
  );
}

export type MobileNavLink = {
  group: string;
  label: string;
  path: string;
  downloadPath?: string;
  downloadFilename?: string;
};

function collectNavLinks(groups: NavItem[]): MobileNavLink[] {
  const links: MobileNavLink[] = [];
  groups.forEach((group) => {
    group.items.forEach((item: NavLinkItem) => {
      if (canForPath(item.path, "view")) {
        links.push({
          group: group.title,
          label: item.label,
          path: item.path,
          downloadPath: item.downloadPath,
          downloadFilename: item.downloadFilename
        });
      }
    });
  });
  return links;
}

export function mobileNavLinksForUser(): MobileNavLink[] {
  return [
    ...collectNavLinks(TrackNav),
    ...collectNavLinks(AnalyzeNav),
    ...collectNavLinks(ControlNav),
    ...collectNavLinks(DeliverNav)
  ];
}

export function isMobileTabPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/mobile/profile" || pathname.startsWith("/mobile/preview")) return true;
  return TAB_DEFS.some((tab) => tab.path !== "/" && tab.path !== "/mobile/profile" && tab.path !== "/mobile/preview" && pathname.startsWith(tab.path));
}

export function activeMobileTabId(pathname: string, tabs: MobileNavTab[]): string {
  if (pathname === "/mobile/profile") return "profile";
  if (pathname.startsWith("/mobile/preview")) return "preview";
  if (pathname === "/") return "home";
  const exact = tabs.find((tab) => tab.path !== "/" && pathname === tab.path);
  if (exact) return exact.id;
  const prefix = [...tabs]
    .filter((tab) => tab.path !== "/" && tab.path !== "/mobile/profile" && tab.path !== "/mobile/preview")
    .sort((a, b) => b.path.length - a.path.length)
    .find((tab) => pathname.startsWith(tab.path));
  return prefix?.id ?? "home";
}
