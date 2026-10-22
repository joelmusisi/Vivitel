import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import ViviLogo from "../ViviLogo";
import MarketingMegaNav from "./MarketingMegaNav";
import {
  MARKETING_FOOTER_COLUMNS,
  MARKETING_PRIMARY_NAV,
  marketingNavIsCurrent
} from "../../pages/marketing/marketingSiteStructure";
import "../../pages/marketing/marketing.css";

function MenuIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export default function MarketingLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu whenever navigation happens.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent background scroll while the mobile menu is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <div className="marketing-site">
      <header className="marketing-header marketing-header--mega">
        <button
          type="button"
          className="marketing-header__menu-btn"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <MenuIcon open={mobileOpen} />
        </button>

        <Link to="/" className="marketing-header__brand" aria-label="VIVI Telematics home">
          <ViviLogo variant="light" className="marketing-header__logo brand-logo" align="start" />
        </Link>

        <div className="marketing-header__actions">
          <Link to="/login" className="marketing-btn marketing-btn--primary">
            Access Telematics
          </Link>
        </div>
      </header>

      <MarketingMegaNav />

      {mobileOpen && (
        <div className="marketing-mobile-menu" role="dialog" aria-modal="true" aria-label="Site menu">
          <button
            type="button"
            className="marketing-mobile-menu__backdrop"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="marketing-mobile-menu__panel" aria-label="Mobile navigation">
            <div className="marketing-mobile-menu__primary">
              {MARKETING_PRIMARY_NAV.map((item) => {
                const current = marketingNavIsCurrent(location.pathname, item.match);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={() => `marketing-mobile-menu__cta${current ? " is-current" : ""}`}
                    aria-current={current ? "page" : undefined}
                  >
                    {item.label}
                  </NavLink>
                );
              })}
              <Link to="/login" className="marketing-btn marketing-btn--primary marketing-mobile-menu__login">
                Access Telematics
              </Link>
            </div>
          </nav>
        </div>
      )}

      <Outlet />

      <section className="marketing-cta-band">
        <div className="marketing-cta-band__inner marketing-cta-band__inner--solo">
          <div>
            <h2>Ready to operate smarter?</h2>
            <p>Sign in from the header for live tracking, video, alerts, and reports.</p>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer__brand-row">
          <ViviLogo variant="light" className="marketing-footer__logo brand-logo" align="start" />
          <p>
            Drive <strong className="marketing-footer__accent">smarter</strong>. Operate{" "}
            <strong className="marketing-footer__accent">safer</strong>. Grow{" "}
            <strong className="marketing-footer__accent">faster</strong>.
          </p>
        </div>

        <div className="marketing-footer__grid marketing-footer__grid--garmin">
          {MARKETING_FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h3>{column.title}</h3>
              {column.links.map((link) => (
                <p key={`${column.title}-${link.to}-${link.label}`}>
                  <Link to={link.to}>{link.label}</Link>
                </p>
              ))}
            </div>
          ))}
        </div>

        <div className="marketing-footer__legal">
          <Link to="/company/about">Site map</Link>
          <Link to="/company/about">Terms & privacy</Link>
          <Link to="/support">Digital accessibility</Link>
        </div>

        <div className="marketing-footer__bottom">© {new Date().getFullYear()} VIVI Telematics. All rights reserved.</div>
      </footer>
    </div>
  );
}
