import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ViviLogo from "../ViviLogo";
import ThemeToggleButton from "../ThemeToggleButton";
import { activeMobileTabId, mobileTabsForUser, type MobileNavLink } from "../../utils/mobileNav";
import { downloadAuthenticatedFile } from "../../utils/api";
import { showToast } from "../../utils/toast";
import { readScopeNaming } from "../../utils/selectionScope";
import "./MobilePhoneShell.css";

type MobilePhoneHeaderProps = {
  onMenuOpen?: () => void;
  alertCount?: number;
};

function scopeSummary(): string {
  return readScopeNaming().label;
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function MobilePhoneHeader({ alertCount = 0 }: MobilePhoneHeaderProps) {
  const navigate = useNavigate();
  const [scopeLabel, setScopeLabel] = useState(scopeSummary);

  useEffect(() => {
    const refresh = () => setScopeLabel(scopeSummary());
    refresh();
    window.addEventListener("vivi:orgchange", refresh);
    window.addEventListener("vivi:contextchange", refresh);
    return () => {
      window.removeEventListener("vivi:orgchange", refresh);
      window.removeEventListener("vivi:contextchange", refresh);
    };
  }, []);

  return (
    <header className="mobile-phone-header">
      <div className="mobile-phone-header__brand" onClick={() => navigate("/")} role="button" tabIndex={0}>
        <ViviLogo className="mobile-phone-header__logo" />
        <span className="mobile-phone-header__scope">{scopeLabel}</span>
      </div>
      <div className="mobile-phone-header__actions">
        <ThemeToggleButton compact />
        <button
          type="button"
          className="mobile-phone-header__icon"
          aria-label="Alerts"
          onClick={() => navigate("/mobile/alerts")}
        >
          <BellIcon />
          {alertCount > 0 && <span className="mobile-phone-header__badge">{alertCount > 9 ? "9+" : alertCount}</span>}
        </button>
      </div>
    </header>
  );
}

function TabIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "map":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
          <path d="M9 3v15M15 6v15" />
        </svg>
      );
    case "reports":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15V9M12 17V7M16 13v-2" />
        </svg>
      );
    case "alerts":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "preview":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "profile":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-4 6.5-4 8-4s6.5 0 8 4" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
  }
}

export function MobilePhoneBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = mobileTabsForUser();
  const activeId = activeMobileTabId(location.pathname, tabs);

  if (tabs.length === 0) return null;

  return (
    <nav className="mobile-phone-nav" aria-label="Primary">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`mobile-phone-nav__item${activeId === tab.id ? " is-active" : ""}`}
          aria-current={activeId === tab.id ? "page" : undefined}
          onClick={() => navigate(tab.path)}
        >
          <TabIcon icon={tab.icon} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

type MobilePhoneDrawerProps = {
  open: boolean;
  onClose: () => void;
  links: MobileNavLink[];
};

export function MobilePhoneDrawer({ open, onClose, links }: MobilePhoneDrawerProps) {
  const navigate = useNavigate();
  const grouped = links.reduce<Record<string, typeof links>>((acc, link) => {
    acc[link.group] = acc[link.group] ?? [];
    acc[link.group].push(link);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div className="mobile-phone-drawer" role="dialog" aria-modal="true" aria-label="Application menu">
      <button type="button" className="mobile-phone-drawer__backdrop" aria-label="Close menu" onClick={onClose} />
      <aside className="mobile-phone-drawer__panel">
        <div className="mobile-phone-drawer__head">
          <ViviLogo className="mobile-phone-drawer__logo" />
          <button type="button" className="mobile-phone-header__icon" aria-label="Close menu" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="mobile-phone-drawer__body">
          {Object.entries(grouped).map(([group, items]) => (
            <section key={group} className="mobile-phone-drawer__section">
              <h3>{group}</h3>
              <ul>
                {items.map((item) => (
                  <li key={item.downloadPath ?? item.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (item.downloadPath) {
                          void downloadAuthenticatedFile(item.downloadPath, item.downloadFilename).then((result) => {
                            if (!result.ok) showToast(result.error ?? "Download failed.", "error");
                          });
                          return;
                        }
                        navigate(item.path);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {links.length === 0 && <p className="mobile-phone-drawer__empty">No pages available for your access level.</p>}
        </div>
      </aside>
    </div>
  );
}
