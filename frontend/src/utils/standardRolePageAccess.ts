/**
 * Header menus are hidden when /auth/me returns no page rows for the active database.
 * These defaults match backend/src/shared/standardRoles.ts and apply only when the
 * stored matrix is empty. A saved matrix always wins.
 */

export type StandardPageAction = "view" | "edit" | "delete";

const BASIC_VIEW = new Set([
  "/Track/overview/fleet",
  "/Track/activity/trip-timeline",
  "/Track/tracking/live",
  "/Track/tracking/historical",
  "/Track/fleet/assets",
  "/Control/user-settings/personal-settings",
  "/mobile"
]);

const ADVANCED_VIEW = new Set([
  ...BASIC_VIEW,
  "/Track/tracking/easytrack",
  "/Track/fleet/drivers",
  "/Track/fleet/passengers",
  "/Track/fleet/customers",
  "/Track/coaching/driver-debrief",
  "/Track/jobs/message-box",
  "/Track/videos/dashboard",
  "/Analyze/insights/dashboards",
  "/Analyze/insights/reports",
  "/Track/tracking/Control-locations"
]);

const ADVANCED_EDIT = new Set([
  "/Track/fleet/assets",
  "/Track/fleet/drivers",
  "/Track/tracking/live",
  "/Track/tracking/historical",
  "/Control/user-settings/personal-settings"
]);

const DEALER_SUPPORT_VIEW = new Set([
  ...ADVANCED_VIEW,
  "/Control/config/libraries",
  "/Control/config/templates",
  "/Control/config/configuration-groups",
  "/Control/operations/dealer-administration",
  "/Control/user-admin/users",
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups",
  "/Control/contacts/Control-contacts",
  "/Control/mobile-device-admin",
  "/Control/mobile-device-admin/mitac-software",
  "/Control/notifications/device-Alerts",
  "/Analyze/insights/Notification-analyser",
  "/Analyze/insights/location-analyser"
]);

const DEALER_SUPPORT_EDIT = new Set([
  ...ADVANCED_EDIT,
  "/Control/user-admin/users",
  "/Control/user-admin/security-groups",
  "/Control/config/libraries",
  "/Control/config/configuration-groups",
  "/Control/notifications/device-Alerts"
]);

const OWN_SUPPORT_EDIT = new Set([
  ...DEALER_SUPPORT_EDIT,
  "/Control/user-admin/roles",
  "/Control/user-admin/security-groups",
  "/Control/operations/dealer-administration",
  "/Control/operations/database-administration",
  "/Control/operations/organisation-goals",
  "/Control/config/templates",
  "/Control/config/Vivi-d-Track-configuration",
  "/Control/notifications/satellite-assisted-notifications",
  "/Control/notifications/device-Alerts",
  "/Deliver/drone-delivery",
  "/Deliver/orders",
  "/Deliver/scheduling"
]);

type RoleKey = "admin" | "own-support" | "dealer-support" | "advanced-user" | "basic-user";

const ROLE_RANK: RoleKey[] = ["admin", "own-support", "dealer-support", "advanced-user", "basic-user"];

const isAdminName = (value: string) => {
  const name = value.trim().toLowerCase();
  return name === "admin" || name === "tenant admin" || name === "administrator";
};

const matchRole = (names: string[]): RoleKey | null => {
  const keys = names.map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return null;
  for (const role of ROLE_RANK) {
    if (role === "admin" && keys.some((name) => isAdminName(name) || name === "admin")) return "admin";
    if (role === "own-support" && keys.some((name) => name === "own support" || name === "own-support")) return "own-support";
    if (role === "dealer-support" && keys.some((name) => name === "dealer support" || name === "dealer-support")) return "dealer-support";
    if (role === "advanced-user" && keys.some((name) => name === "advanced user" || name === "advanced-user")) return "advanced-user";
    if (role === "basic-user" && keys.some((name) => name === "basic user" || name === "basic-user" || name === "basic")) return "basic-user";
  }
  return null;
};

const grants = (view: Set<string>, edit: Set<string>, pagePath: string, action: StandardPageAction) => {
  if (action === "delete") return false;
  if (action === "edit") return edit.has(pagePath);
  return view.has(pagePath) || edit.has(pagePath);
};

/** null when the names are not a standard role. */
export const grantsStandardRolePage = (roleNames: string[], pagePath: string, action: StandardPageAction): boolean | null => {
  const role = matchRole(roleNames);
  const path = String(pagePath ?? "").trim();
  if (!role || !path) return null;
  if (role === "admin") return true;
  if (role === "own-support") {
    if (path === "/Control/operations/organisation-groups") return false;
    if (action === "view") return true;
    if (action === "delete") return false;
    return OWN_SUPPORT_EDIT.has(path);
  }
  if (role === "dealer-support") return grants(DEALER_SUPPORT_VIEW, DEALER_SUPPORT_EDIT, path, action);
  if (role === "advanced-user") return grants(ADVANCED_VIEW, ADVANCED_EDIT, path, action);
  return grants(BASIC_VIEW, new Set(["/Control/user-settings/personal-settings"]), path, action);
};
