import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteMap } from "../types";

/**
 * Control module — libraries, bindings, config, ops, users, notifications, settings.
 */
const Libraries = lazy(() => import("../../pages/manage/Libraries"));
const Bindings = lazy(() => import("../../pages/manage/Bindings"));
const MobileDeviceAdmin = lazy(() => import("../../pages/manage/MobileDeviceAdmin"));
const ConfigAdmin = lazy(() => import("../../pages/manage/ConfigAdmin"));
const OperationsAdmin = lazy(() => import("../../pages/manage/OperationsAdmin"));
const ContactsAdmin = lazy(() => import("../../pages/manage/ContactsAdmin"));
const UserAdmin = lazy(() => import("../../pages/manage/UserAdmin"));
const NotificationsAdmin = lazy(() => import("../../pages/manage/NotificationsAdmin"));
const DeviceAlertsAdmin = lazy(() => import("../../pages/manage/DeviceAlertsAdmin"));
const UserSettingsAdmin = lazy(() => import("../../pages/manage/UserSettingsAdmin"));
const PersonalSettings = lazy(() => import("../../pages/manage/PersonalSettings"));

export const controlRouteComponents: ModuleRouteMap = {
  "/Control/config/libraries": Libraries,
  "/Control/config/templates": Bindings,
  "/Control/mobile-device-admin": MobileDeviceAdmin,
  "/Control/config/configuration-groups": ConfigAdmin,
  "/Control/config/Vivi-d-Track-configuration": ConfigAdmin,
  "/Control/config/task-Controlment-configuration": ConfigAdmin,
  "/Control/config/asset-commissioning": ConfigAdmin,
  "/Control/operations/database-administration": OperationsAdmin,
  "/Control/operations/dealer-administration": OperationsAdmin,
  "/Control/operations/organisation-settings": OperationsAdmin,
  "/Control/operations/data-exclusion": OperationsAdmin,
  "/Control/operations/release-Controlment": OperationsAdmin,
  "/Control/operations/organisation-goals": OperationsAdmin,
  "/Control/operations/organisation-groups": OperationsAdmin,
  "/Control/contacts/Control-contacts": ContactsAdmin,
  "/Control/user-admin/users": UserAdmin,
  "/Control/user-admin/users/create": UserAdmin,
  "/Control/user-admin/users/edit/:userId": UserAdmin,
  "/Control/user-admin/users/access/:userId": UserAdmin,
  "/Control/user-admin/roles": UserAdmin,
  "/Control/user-admin/roles/create": UserAdmin,
  "/Control/user-admin/roles/edit/:roleId": UserAdmin,
  "/Control/user-admin/security-groups": UserAdmin,
  "/Control/user-admin/security-groups/create": UserAdmin,
  "/Control/user-admin/security-groups/edit/:groupId": UserAdmin,
  "/Control/notifications/satellite-assisted-notifications": NotificationsAdmin,
  "/Control/notifications/device-Alerts": DeviceAlertsAdmin,
  "/Control/user-settings/user-scoring": UserSettingsAdmin,
  "/Control/user-settings/personal-access-tokens": UserSettingsAdmin,
  "/Control/user-settings/personal-settings": PersonalSettings
};

export const controlModule = {
  id: "control" as const,
  label: "Control",
  routeComponents: controlRouteComponents
};
