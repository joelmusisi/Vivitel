import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";

/**
 * One collapse/expand tab for every page's left panel (Assets filters, Live Tracking assets,
 * Libraries, Bindings, ...). It finds the panel in the DOM, so pages need no changes, and marks
 * it with data attributes (not classes, which React rewrites on re-render). CSS in index.css
 * hides the panel and gives its layout a single column while collapsed.
 */
const LEFT_PANEL_SELECTOR = [
  ".assets-filter",
  ".live-sidebar:not(.live-sidebar--drawer)",
  ".libraries-sidebar",
  ".bindings-sidebar",
  ".config-groups-sidebar",
  ".reports-sidebar",
  ".locations-admin-sidebar",
  ".remote-access-sidebar",
  ".sat-sidebar"
].join(", ");

const storageKey = (pathname: string) => `vivi.leftPanelCollapsed:${pathname}`;

const readCollapsed = (pathname: string) => {
  try {
    return window.localStorage.getItem(storageKey(pathname)) === "1";
  } catch {
    return false;
  }
};

const findPanel = (): HTMLElement | null => {
  const panel = document.querySelector<HTMLElement>(LEFT_PANEL_SELECTOR);
  return panel?.parentElement ? panel : null;
};

export default function LeftPanelToggle() {
  const { pathname } = useLocation();
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(pathname));
  const [panelWidth, setPanelWidth] = useState(0);

  useEffect(() => {
    setCollapsed(readCollapsed(pathname));
  }, [pathname]);

  // Pages load lazily; watch the DOM (throttled to one check per frame) for the panel.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setPanel((current) => {
        const next = findPanel();
        return current === next ? current : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    check();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  const host = panel?.parentElement ?? null;

  useEffect(() => {
    if (!panel || !host) return;
    panel.setAttribute("data-vivi-left-panel", "");
    host.setAttribute("data-vivi-left-host", "");
    if (collapsed) host.setAttribute("data-vivi-left-collapsed", "");
    else host.removeAttribute("data-vivi-left-collapsed");
    const measure = () => setPanelWidth(collapsed ? 0 : panel.offsetLeft + panel.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    // Maps and tables size themselves on window resize; let them refit to the new width.
    window.dispatchEvent(new Event("resize"));
    return () => {
      observer.disconnect();
      host.removeAttribute("data-vivi-left-collapsed");
    };
  }, [panel, host, collapsed]);

  if (!host) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(storageKey(pathname), next ? "1" : "0");
    } catch {
      // Per-viewer convenience only; the toggle still works without storage.
    }
  };

  return createPortal(
    <button
      type="button"
      className="vivi-left-panel-toggle"
      style={{ left: panelWidth }}
      aria-label={collapsed ? "Expand side panel" : "Collapse side panel"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand side panel" : "Collapse side panel"}
      onClick={toggle}
    >
      <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
    </button>,
    host
  );
}
