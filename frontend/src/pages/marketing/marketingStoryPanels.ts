/**

 * Storyboard panels — each image links to one dedicated in-app page.

 */



import { featureImageForPanel } from "./marketingFeatureImages";



export type StoryPanel = {

  id: string;

  image: string;

  label: string;

  caption: string;

  to: string;

};



/** Full storyboard grid */

export const MARKETING_STORY_PANELS: StoryPanel[] = [

  {

    id: "intro",

    image: featureImageForPanel("intro"),

    label: "Platform intro",

    caption: "Smarter Fleets. Safer Roads.",

    to: "/solutions/platform"

  },

  {

    id: "fleet-visibility",

    image: featureImageForPanel("fleet-visibility"),

    label: "Fleet visibility",

    caption: "Complete visibility over your fleet",

    to: "/solutions/visibility"

  },

  {

    id: "gps-tracking",

    image: featureImageForPanel("gps-tracking"),

    label: "Live GPS tracking",

    caption: "Real-time location — every vehicle",

    to: "/solutions/tracking"

  },

  {

    id: "harsh-braking",

    image: featureImageForPanel("harsh-braking"),

    label: "Safety events",

    caption: "Harsh braking & incident alerts",

    to: "/solutions/safety"

  },

  {

    id: "route-history",

    image: featureImageForPanel("route-history"),

    label: "Route history",

    caption: "Playback. Analyse. Improve.",

    to: "/solutions/route-history"

  },

  {

    id: "driver-fatigue",

    image: featureImageForPanel("driver-fatigue"),

    label: "Driver fatigue",

    caption: "Fatigue detected — driver alert",

    to: "/solutions/driver-fatigue"

  },

  {

    id: "fuel-monitoring",

    image: featureImageForPanel("fuel-monitoring"),

    label: "Fuel monitoring",

    caption: "Reduce costs. Increase efficiency.",

    to: "/solutions/fuel"

  },

  {

    id: "hardware-devices",

    image: featureImageForPanel("hardware-devices"),

    label: "Hardware",

    caption: "Dashcams, trackers & sensors",

    to: "/solutions/hardware"

  },

  {

    id: "powerful-insights",

    image: featureImageForPanel("powerful-insights"),

    label: "Analytics",

    caption: "Powerful insights & dashboards",

    to: "/solutions/analytics"

  }

];



export function getStoryPanel(id: string): StoryPanel | undefined {

  return MARKETING_STORY_PANELS.find((row) => row.id === id);

}

