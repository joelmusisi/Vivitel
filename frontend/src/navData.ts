export type NavLinkItem = {
  label: string;
  path: string;
  /** When set, clicking the nav item downloads this API path instead of routing. */
  downloadPath?: string;
  /** Suggested filename for browser download (defaults on the client). */
  downloadFilename?: string;
};

export type NavItem = {
  title: string;
  items: NavLinkItem[];
};

export const ControlNav: NavItem[] = [
  {
    title: "Config Admin",
    items: [
      { label: "Libraries", path: "/Control/config/libraries" },
      { label: "Bindings", path: "/Control/config/templates" },
      { label: "Configuration Groups", path: "/Control/config/configuration-groups" },
      { label: "Vivi D-Track Configuration", path: "/Control/config/Vivi-d-Track-configuration" }
    ]
  },
  {
    title: "Operations",
    items: [
      { label: "Database Administration", path: "/Control/operations/database-administration" },
      { label: "Dealer Administration", path: "/Control/operations/dealer-administration" },
      { label: "Organisation Goals", path: "/Control/operations/organisation-goals" },
      { label: "Organisations", path: "/Control/operations/organisation-groups" }
    ]
  },
  {
    title: "Contacts",
    items: [{ label: "Control Contacts", path: "/Control/contacts/Control-contacts" }]
  },
  {
    title: "Mobile Device Admin",
    items: [
      { label: "Mobile Device Admin", path: "/Control/mobile-device-admin" },
      {
        label: "Mitac software",
        path: "/Control/mobile-device-admin/mitac-software",
        downloadPath: "/downloads/mitac-software",
        downloadFilename: "Vivitel_Mitac_Pack.zip"
      }
    ]
  },
  {
    title: "User Admin",
    items: [
      { label: "Users", path: "/Control/user-admin/users" },
      { label: "Roles", path: "/Control/user-admin/roles" },
      { label: "Security Groups", path: "/Control/user-admin/security-groups" }
    ]
  },
  {
    title: "Alerts",
    items: [
      { label: "Location Alerts", path: "/Control/notifications/satellite-assisted-notifications" },
      { label: "Device Alerts", path: "/Control/notifications/device-Alerts" }
    ]
  },
  {
    title: "User Settings",
    items: [
      { label: "User Scoring", path: "/Control/user-settings/user-scoring" },
      { label: "Personal Access Tokens", path: "/Control/user-settings/personal-access-tokens" },
      { label: "Personal Settings", path: "/Control/user-settings/personal-settings" }
    ]
  }
];

export const AnalyzeNav: NavItem[] = [
  {
    title: "Insights",
    items: [
      { label: "Dashboards", path: "/Analyze/insights/dashboards" },
      { label: "Reports", path: "/Analyze/insights/reports" },
      { label: "Vivi Insight Agility", path: "/Analyze/insights/Vivi-insight-agility" },
      { label: "Subscriptions", path: "/Analyze/insights/subscriptions" },
      { label: "Notification Analyser", path: "/Analyze/insights/Notification-analyser" },
      { label: "Location Analyser", path: "/Analyze/insights/location-analyser" }
    ]
  }
];

export const TrackNav: NavItem[] = [
  {
    title: "FLEET OVERVIEW",
    items: [{ label: "Command Center", path: "/Track/overview/fleet" }]
  },
  {
    title: "ACTIVITY TIMELINE",
    items: [
      { label: "Trip Timeline", path: "/Track/activity/trip-timeline" }
    ]
  },
  {
    title: "DRIVER COACHING",
    items: [
      { label: "Driver Debrief", path: "/Track/coaching/driver-debrief" }
    ]
  },
  {
    title: "VIDEO TELEMATICS",
    items: [
      { label: "Dashboard", path: "/Track/videos/dashboard" }
    ]
  },
  {
    title: "FLEET ADMIN",
    items: [
      { label: "Assets", path: "/Track/fleet/assets" },
      { label: "Drivers", path: "/Track/fleet/drivers" },
      { label: "Passengers", path: "/Track/fleet/passengers" },
      { label: "Customers", path: "/Track/fleet/customers" }
    ]
  },
  {
    title: "ROUTES",
    items: [
      { label: "Workflow", path: "/Track/routes/workflow" },
      { label: "Libraries", path: "/Track/routes/libraries" },
      { label: "Tracking", path: "/Track/routes/Tracking" },
      { label: "Resource allocation", path: "/Track/routes/resource-allocation" }
    ]
  },
  {
    title: "HOURS OF SERVICE",
    items: [
      { label: "Hos Dashboard", path: "/Track/hos/dashboard" },
      { label: "Hos Overview", path: "/Track/hos/overview" },
      { label: "Timeline", path: "/Track/hos/timeline" },
      { label: "Log Viewer", path: "/Track/hos/log-viewer" },
      { label: "Hos Alerts", path: "/Track/hos/notifications" },
      { label: "Timeclock", path: "/Track/hos/timeclock" }
    ]
  },
  {
    title: "Task Controlment",
    items: [
      { label: "Tasks", path: "/Track/tasks/tasks" },
      { label: "Templates", path: "/Track/tasks/templates" },
      { label: "Workers", path: "/Track/tasks/workers" }
    ]
  },
  {
    title: "INFO HUB",
    items: [{ label: "Streams", path: "/Track/info-hub/streams" }]
  },
  {
    title: "TRACKING",
    items: [
      { label: "Live Tracking", path: "/Track/tracking/live" },
      { label: "Historical Tracking", path: "/Track/tracking/historical" },
      { label: "Easytrack", path: "/Track/tracking/easytrack" },
      { label: "Control Locations", path: "/Track/tracking/Control-locations" },
      { label: "Control Road Hazards", path: "/Track/tracking/Control-road-hazards" }
    ]
  }
];

export const DeliverNav: NavItem[] = [
  {
    title: "Delivery",
    items: [
      { label: "Operations", path: "/Deliver/drone-delivery" },
      { label: "Orders", path: "/Deliver/orders" },
      { label: "Drone Live Tracking", path: "/Deliver/drone-live-tracking" },
      { label: "Drone Historical Tracking", path: "/Deliver/drone-historical-tracking" },
      { label: "Scheduling", path: "/Deliver/scheduling" },
      { label: "Clients", path: "/Deliver/clients" },
      { label: "Drone Groups", path: "/Deliver/drone-groups" },
      { label: "Regions", path: "/Deliver/regions" },
      { label: "Health", path: "/Deliver/health" }
    ]
  },
  {
    title: "Platform",
    items: [
      { label: "Customer App", path: "/Deliver/platform/customer" },
      { label: "Ground Ops", path: "/Deliver/platform/ground-ops" },
      { label: "Drone Ops", path: "/Deliver/platform/drone-ops" },
      { label: "Driver App", path: "/Deliver/platform/driver" },
      { label: "Warehouse", path: "/Deliver/platform/warehouse" },
      { label: "Merchant", path: "/Deliver/platform/merchant" },
      { label: "Support", path: "/Deliver/platform/support" },
      { label: "Super Admin", path: "/Deliver/platform/super-admin" }
    ]
  }
];
