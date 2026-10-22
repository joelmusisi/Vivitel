import { NavLink, useLocation } from "react-router-dom";
import { MARKETING_PRIMARY_NAV, marketingNavIsCurrent } from "../../pages/marketing/marketingSiteStructure";

export default function MarketingMegaNav() {
  const { pathname } = useLocation();

  return (
    <nav className="marketing-mega" aria-label="Site">
      <div className="marketing-mega__bar">
        {MARKETING_PRIMARY_NAV.map((item) => {
          const current = marketingNavIsCurrent(pathname, item.match);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={() => `marketing-mega__tab${current ? " is-current" : ""}`}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
