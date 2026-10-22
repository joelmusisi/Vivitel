import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import type { ModuleRouteMap } from "../types";

/**
 * Deliver module — drone delivery and platform apps.
 */
const DroneDelivery = lazy(() => import("../../pages/DroneDelivery"));
const DeliverClients = lazy(() => import("../../pages/DeliverClients"));
const DeliverDroneGroups = lazy(() => import("../../pages/DeliverDroneGroups"));
const DeliverRegions = lazy(() => import("../../pages/DeliverRegions"));
const DeliverHealth = lazy(() => import("../../pages/DeliverHealth"));
const DeliverOrders = lazy(() => import("../../pages/DeliverOrders"));
const DeliverDroneLiveTracking = lazy(() => import("../../pages/DeliverDroneLiveTracking"));
const DeliverDroneHistoricalTracking = lazy(() => import("../../pages/DeliverDroneHistoricalTracking"));
const DeliverScheduling = lazy(() => import("../../pages/DeliverScheduling"));
const DeliverCustomerApp = lazy(() => import("../../pages/deliver/DeliverCustomerApp"));
const DeliverGroundOps = lazy(() => import("../../pages/deliver/DeliverGroundOps"));
const DeliverDroneOps = lazy(() => import("../../pages/deliver/DeliverDroneOps"));
const DeliverDriverApp = lazy(() => import("../../pages/deliver/DeliverDriverApp"));
const DeliverWarehouse = lazy(() => import("../../pages/deliver/DeliverWarehouse"));
const DeliverMerchant = lazy(() => import("../../pages/deliver/DeliverMerchant"));
const DeliverSupport = lazy(() => import("../../pages/deliver/DeliverSupport"));
const DeliverSuperAdmin = lazy(() => import("../../pages/deliver/DeliverSuperAdmin"));

export const deliverRouteComponents: ModuleRouteMap = {
  "/Deliver/drone-delivery": DroneDelivery,
  "/Deliver/clients": DeliverClients,
  "/Deliver/drone-groups": DeliverDroneGroups,
  "/Deliver/regions": DeliverRegions,
  "/Deliver/health": DeliverHealth,
  "/Deliver/orders": DeliverOrders,
  "/Deliver/drone-live-tracking": DeliverDroneLiveTracking,
  "/Deliver/drone-historical-tracking": DeliverDroneHistoricalTracking,
  "/Deliver/scheduling": DeliverScheduling,
  "/Deliver/platform/customer": DeliverCustomerApp,
  "/Deliver/platform/ground-ops": DeliverGroundOps,
  "/Deliver/platform/drone-ops": DeliverDroneOps,
  "/Deliver/platform/driver": DeliverDriverApp,
  "/Deliver/platform/warehouse": DeliverWarehouse,
  "/Deliver/platform/merchant": DeliverMerchant,
  "/Deliver/platform/support": DeliverSupport,
  "/Deliver/platform/super-admin": DeliverSuperAdmin
};

export const deliverModule = {
  id: "deliver" as const,
  label: "Deliver",
  routeComponents: deliverRouteComponents
};
