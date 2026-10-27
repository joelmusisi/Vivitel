export const BRAND_LOGO = {
  default: "/logo-vivi-telematics-nav-dark.png?v=11",
  dark: "/logo-vivi-telematics-nav-dark.png?v=11",
  light: "/logo-vivi-telematics-nav-light.png?v=11",
  raster: "/logo-vivi-telematics.png?v=11",
} as const;

export type BrandLogoVariant = keyof typeof BRAND_LOGO;

/** Downloaded reports use the transparent wordmark (800 × 437) at its own proportions. */
export const REPORT_LOGO_VARIANT: BrandLogoVariant = "light";
export const REPORT_LOGO_ASPECT = 800 / 437;
export const reportLogoSize = (height: number) => ({ width: Math.round(height * REPORT_LOGO_ASPECT), height });

export function brandLogoSrc(variant: Exclude<BrandLogoVariant, "raster"> = "default"): string {
  return BRAND_LOGO[variant];
}

export async function brandLogoToDataUrl(
  variant: BrandLogoVariant = "light",
  width = 720,
  height = 192
): Promise<string | null> {
  const path = BRAND_LOGO[variant];

  try {
    const response = await fetch(path);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (path.endsWith(".png") || blob.type.includes("png") || blob.type.includes("jpeg")) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }
          reject(new Error("Unable to read logo file"));
        };
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read logo file"));
        reader.readAsDataURL(blob);
      });
    }

    const svgText = await response.text();
    const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Unable to render logo"));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return null;

      context.clearRect(0, 0, width, height);
      const imageRatio = image.width / Math.max(1, image.height);
      const canvasRatio = width / Math.max(1, height);
      let dw = width;
      let dh = height;
      let dx = 0;
      let dy = 0;
      if (imageRatio > canvasRatio) {
        dh = width / imageRatio;
        dy = (height - dh) / 2;
      } else {
        dw = height * imageRatio;
        dx = (width - dw) / 2;
      }
      context.drawImage(image, dx, dy, dw, dh);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}
