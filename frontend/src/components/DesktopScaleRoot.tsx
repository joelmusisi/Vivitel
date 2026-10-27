import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DESKTOP_DESIGN_WIDTH_PX, computeDesktopScale } from "../utils/desktopScale";

const supportsCssZoom =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "1");

type DesktopScaleRootProps = {
  enabled: boolean;
  children: ReactNode;
};

export function DesktopScaleRoot({ enabled, children }: DesktopScaleRootProps) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) {
      setScale(1);
      document.documentElement.style.setProperty("--vivi-desktop-scale", "1");
      document.documentElement.classList.remove("vivi-desktop-scaled");
      return;
    }

    const apply = () => {
      // Round so Windows DPI/resize jitter cannot thrash scale → remount → React #185.
      const next = Number(computeDesktopScale(window.innerWidth, false).toFixed(4));
      // Always write the CSS var: the cleanup below resets it to 1, and when the effect re-runs
      // with an unchanged scale the state bail-out would otherwise leave the var stale. A stale
      // var made full-height pages (Live Tracking) only ~half the tablet screen tall.
      document.documentElement.style.setProperty("--vivi-desktop-scale", String(next));
      document.documentElement.classList.toggle("vivi-desktop-scaled", next < 1);
      setScale((prev) => {
        if (prev === next) return prev;
        window.dispatchEvent(new CustomEvent("vivi:desktop-scale", { detail: { scale: next } }));
        return next;
      });
    };

    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.documentElement.style.setProperty("--vivi-desktop-scale", "1");
      document.documentElement.classList.remove("vivi-desktop-scaled");
    };
  }, [enabled]);

  if (!enabled || scale >= 1) {
    return <>{children}</>;
  }

  const canvasStyle: CSSProperties = supportsCssZoom
    ? {
        width: DESKTOP_DESIGN_WIDTH_PX,
        height: `${100 / scale}vh`,
        zoom: scale
      }
    : {
        width: DESKTOP_DESIGN_WIDTH_PX,
        height: `${100 / scale}vh`,
        transform: `scale(${scale})`,
        transformOrigin: "top left"
      };

  return (
    <div className="desktop-scale-viewport">
      <div className="desktop-scale-canvas" style={canvasStyle}>
        {children}
      </div>
    </div>
  );
}

export default DesktopScaleRoot;
