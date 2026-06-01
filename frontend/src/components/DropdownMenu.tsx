import { NavLink } from "react-router-dom";
import { NavItem } from "../navData";

interface DropdownMenuProps {
  label: string;
  groups: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  onItemSelect?: () => void;
}

export function DropdownMenu({ label, groups, isOpen, onToggle, onItemSelect }: DropdownMenuProps) {
  return (
    <div className="menu-item">
      <button
        className="menu-button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {label}
        <span className={`caret-icon ${isOpen ? "open" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {isOpen && (
        <div className="dropdown" role="menu">
          {visibleGroups.map((group) => (
            <div key={group.title} className="dropdown-col">
              <p className="dropdown-title">{group.title}</p>
              <ul>
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={() => {
                        onItemSelect?.();
                      }}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DropdownMenu;
