import { AnalyzeNav, ControlNav, TrackNav } from "../navData";

/** Detail screens whose URL ends in an id. The ribbon should show the page name. */
const DETAIL_PAGE_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/Control\/user-admin\/users\/create\/?$/i, label: "Create user" },
  { pattern: /^\/Control\/user-admin\/users\/edit\/[^/]+\/?$/i, label: "Edit user" },
  { pattern: /^\/Control\/user-admin\/users\/access\/[^/]+\/?$/i, label: "User access" },
  { pattern: /^\/Control\/user-admin\/roles\/create\/?$/i, label: "Create role" },
  { pattern: /^\/Control\/user-admin\/roles\/edit\/[^/]+\/?$/i, label: "Edit role" },
  { pattern: /^\/Control\/user-admin\/security-groups\/create\/?$/i, label: "Create security group" },
  { pattern: /^\/Control\/user-admin\/security-groups\/edit\/[^/]+\/?$/i, label: "Edit security group" }
];

export function ribbonPageLabel(pathname: string): string {
  if (pathname === "/") return "Home";

  const detail = DETAIL_PAGE_LABELS.find((entry) => entry.pattern.test(pathname));
  if (detail) return detail.label;

  const navItems = [...TrackNav, ...ControlNav, ...AnalyzeNav].flatMap((group) => group.items);
  const found = navItems.find((item) => item.path === pathname);
  if (found?.label) return found.label;

  const fallback = pathname.split("/").filter(Boolean).slice(-1)[0] ?? "";
  if (!fallback) return "Page";
  return fallback.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
