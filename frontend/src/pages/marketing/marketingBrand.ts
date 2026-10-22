/** Official VIVI Telematics brand — matches logo SVG and pitch-deck styling */

export const VIVI_BRAND = {
  green: "#89c84a",
  greenDark: "#5fa828",
  black: "#0a0a0a",
  white: "#ffffff",
  slogan: "Smarter Fleets. Safer Roads.",
  taglineWords: ["smarter", "safer", "faster"] as const,
  tagline: "Drive smarter. Operate safer. Grow faster.",
  logoOnDark: "/logo-vivi-telematics-nav-dark.png?v=11",
  logoOnLight: "/logo-vivi-telematics-nav-light.png?v=11",
  logoWordmark: "/vivi-wordmark.svg",
  website: "www.vivitelematics.com",
  phone: "+27 76 405 2278",
  phoneTel: "tel:+27764052278",
  /** Official hardware lineup photography */
  hardwarePanelImage: "/marketing/features/hardware-devices.jpg",
  merchStoryImage: "/marketing/stories/branded-tshirts.jpg"
} as const;

export const VIVI_BRAND_PRINT = {
  tshirt:
    "Logo centred on the chest: white VIVI wordmark, green pin on the second I, TELEMATICS in spaced caps below — same artwork as fleet devices.",
  device:
    "VIVI wordmark printed in white on the top face of hardware (sensor box) — centred, ~30% of face width, matching pitch-deck product photography.",
  cupsCaps: "Green and white brand colours; VIVI Telematics logo applied like corporate fleet merchandise."
} as const;
