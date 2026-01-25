import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { monitorNav, manageNav, measureNav } from "../navData";
import DropdownMenu from "./DropdownMenu";

export function TopNav() {
  const [openMenu, setOpenMenu] = useState<"monitor" | "manage" | "measure" | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (openMenu && navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  const toggleMenu = (menu: "monitor" | "manage" | "measure") => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  return (
    <nav className="topnav" ref={navRef}>
      <div className="brand">
        <img src="/logo.jpg" alt="Vivi Telematic logo" className="brand-logo" />
        <div className="brand-text">
          <span className="brand-main">Vivi Telematicx</span>
          <span className="brand-sub">Fleet Intelligence</span>
        </div>
      </div>

      <div className="topnav-links">
        <DropdownMenu
          label="MONITOR"
          groups={monitorNav}
          isOpen={openMenu === "monitor"}
          onToggle={() => toggleMenu("monitor")}
          onItemSelect={() => setOpenMenu(null)}
        />

        <DropdownMenu
          label="MANAGE"
          groups={manageNav}
          isOpen={openMenu === "manage"}
          onToggle={() => toggleMenu("manage")}
          onItemSelect={() => setOpenMenu(null)}
        />

        <DropdownMenu
          label="MEASURE"
          groups={measureNav}
          isOpen={openMenu === "measure"}
          onToggle={() => toggleMenu("measure")}
          onItemSelect={() => setOpenMenu(null)}
        />
      </div>

      <div className="topnav-actions">
        <div className="icon-button" title="Favorite">
          <StarIcon />
        </div>
        <div
          className="icon-button"
          title="Home"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              navigate("/");
            }
          }}
        >
          <HomeIcon />
        </div>
        <div className="icon-button" title="Info">
          <InfoIcon />
        </div>
        <div className="icon-button" title="Power">
          <PowerIcon />
        </div>
        <div className="topnav-user">Welcome Joel Musisi</div>
      </div>
    </nav>
  );
}

export default TopNav;

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.3-4.2 6-.9z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1v-9.5z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 9v.5M11.5 11h1v5h-1z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v8" />
      <path d="M7.5 5.5a8 8 0 1013 6.5 8 8 0 00-3-6.5" />
    </svg>
  );
}
