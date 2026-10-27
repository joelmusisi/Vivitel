import { shouldUsePhoneMode } from "./phoneMode";

/** Desktop pages lay out at this width, then scale down to fit smaller windows. */
export const DESKTOP_DESIGN_WIDTH_PX = 1440;

export const computeDesktopScale = (
  viewportWidth: number,
  isPhone: boolean,
  _isTablet = false
): number => {
  if (isPhone) return 1;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
  if (viewportWidth >= DESKTOP_DESIGN_WIDTH_PX) return 1;
  return viewportWidth / DESKTOP_DESIGN_WIDTH_PX;
};

export const isDesktopScaleEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return !shouldUsePhoneMode();
};
