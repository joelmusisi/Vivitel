export type NavItem = {
  title: string;
  items: { label: string; path: string }[];
};

export const manageNav: NavItem[] = [
  {
    title: "CONFIG ADMIN",
    items: [
      { label: "Libraries", path: "/manage/config/libraries" },
      { label: "Bindings", path: "/manage/config/templates" },
      { label: "Configuration groups", path: "/manage/config/configuration-groups" },
      { label: "Vivi D-Monitor configuration", path: "/manage/config/Vivi-d-monitor-configuration" }
    ]
  },
  {
    title: "OPERATIONS",
    items: [
      { label: "Database administration", path: "/manage/operations/database-administration" },
      { label: "Dealer Administration", path: "/manage/operations/dealer-administration" },
      { label: "Organisation goals", path: "/manage/operations/organisation-goals" },
      { label: "Organisations", path: "/manage/operations/organisation-groups" }
    ]
  },
  {
    title: "CONTACTS",
    items: [{ label: "Manage contacts", path: "/manage/contacts/manage-contacts" }]
  },
  {
    title: "MOBILE DEVICE ADMIN",
    items: [{ label: "Mobile Device Admin", path: "/manage/mobile-device-admin" }]
  },
  {
    title: "USER ADMIN",
    items: [
      { label: "Users", path: "/manage/user-admin/users" },
      { label: "Roles", path: "/manage/user-admin/roles" },
      { label: "Security groups", path: "/manage/user-admin/security-groups" }
    ]
  },
  {
    title: "NOTIFICATIONS",
    items: [{ label: "Satellite Assisted Notifications", path: "/manage/notifications/satellite-assisted-notifications" }]
  },
  {
    title: "USER SETTINGS",
    items: [
      { label: "User scoring", path: "/manage/user-settings/user-scoring" },
      { label: "Personal access tokens", path: "/manage/user-settings/personal-access-tokens" },
      { label: "Personal settings", path: "/manage/user-settings/personal-settings" }
    ]
  }
];

export const measureNav: NavItem[] = [
  {
    title: "INSIGHTS",
    items: [
      { label: "Dashboards", path: "/measure/insights/dashboards" },
      { label: "Reports", path: "/measure/insights/reports" },
      { label: "Vivi Insight Agility", path: "/measure/insights/Vivi-insight-agility" },
      { label: "Subscriptions", path: "/measure/insights/subscriptions" },
      { label: "Notification Analyser", path: "/measure/insights/Notification-analyser" },
      { label: "Location Analyser", path: "/measure/insights/location-analyser" }
    ]
  }
];

export const monitorNav: NavItem[] = [
  {
    title: "ACTIVITY TIMELINE",
    items: [
      { label: "Trip timeline", path: "/monitor/activity/trip-timeline" }
    ]
  },
  {
    title: "JOBS & MESSAGING",
    items: [
      { label: "Default options", path: "/monitor/jobs/default-options" },
      { label: "Message box", path: "/monitor/jobs/message-box" },
      { label: "Instant messaging", path: "/monitor/jobs/instant-messaging" }
    ]
  },
  {
    title: "VIDEO TELEMATICS",
    items: [
      { label: "Dashboard", path: "/monitor/videos/dashboard" }
    ]
  },
  {
    title: "FLEET ADMIN",
    items: [
      { label: "Assets", path: "/monitor/fleet/assets" },
      { label: "Drivers", path: "/monitor/fleet/drivers" },
      { label: "Passengers", path: "/monitor/fleet/passengers" },
      { label: "Customers", path: "/monitor/fleet/customers" }
    ]
  },
  {
    title: "JOURNEY MANAGEMENT",
    items: [
      { label: "Workflow", path: "/monitor/journey/workflow" },
      { label: "Libraries", path: "/monitor/journey/libraries" },
      { label: "Monitoring", path: "/monitor/journey/monitoring" },
      { label: "Resource allocation", path: "/monitor/journey/resource-allocation" }
    ]
  },
  {
    title: "HOURS OF SERVICE",
    items: [
      { label: "HOS dashboard", path: "/monitor/hos/dashboard" },
      { label: "HOS overview", path: "/monitor/hos/overview" },
      { label: "Timeline", path: "/monitor/hos/timeline" },
      { label: "Log viewer", path: "/monitor/hos/log-viewer" },
      { label: "HOS notifications", path: "/monitor/hos/notifications" },
      { label: "Timeclock", path: "/monitor/hos/timeclock" }
    ]
  },
  {
    title: "TASK MANAGEMENT",
    items: [
      { label: "Tasks", path: "/monitor/tasks/tasks" },
      { label: "Templates", path: "/monitor/tasks/templates" },
      { label: "Workers", path: "/monitor/tasks/workers" }
    ]
  },
  {
    title: "INFO HUB",
    items: [{ label: "Streams", path: "/monitor/info-hub/streams" }]
  },
  {
    title: "TRACKING",
    items: [
      { label: "Live tracking", path: "/monitor/tracking/live" },
      { label: "Historical tracking", path: "/monitor/tracking/historical" },
      { label: "EasyTrack", path: "/monitor/tracking/easytrack" },
      { label: "Manage locations", path: "/monitor/tracking/manage-locations" },
      { label: "Manage road hazards", path: "/monitor/tracking/manage-road-hazards" }
    ]
  }
];
