import { NavLink, useLocation } from "react-router-dom";
import { NavItem } from "../navData";
import { canForPath, downloadAuthenticatedFile } from "../utils/api";
import { prefetchNavRoute } from "../utils/navPrefetch";
import { showToast } from "../utils/toast";

interface DropdownMenuProps {
  label: string;
  groups: NavItem[];
  isOpen: boolean;
  isCurrent?: boolean;
  onToggle: () => void;
  onItemSelect?: () => void;
}

export function navGroupsWithViewAccess(groups: NavItem[]): NavItem[] {
  return groups
    .map((group) => ({
      ...group,
      items: (group.items ?? []).filter((item) => canForPath(item.path, "view"))
    }))
    .filter((group) => (group.items ?? []).length > 0);
}

function navItemIsCurrent(pathname: string, itemPath: string, allPaths: string[]) {
  const matches = pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  if (!matches) return false;
  const coveredByLonger = allPaths.some(
    (other) =>
      other !== itemPath &&
      (other === pathname || pathname.startsWith(`${other}/`) || pathname === other) &&
      other.length > itemPath.length &&
      (pathname === other || pathname.startsWith(`${other}/`))
  );
  return !coveredByLonger;
}

export function DropdownMenu({ label, groups, isOpen, isCurrent = false, onToggle, onItemSelect }: DropdownMenuProps) {
  const { pathname } = useLocation();
  const visibleGroups = navGroupsWithViewAccess(groups);
  if (visibleGroups.length === 0) return null;
  const visiblePaths = visibleGroups.flatMap((group) => group.items.map((item) => item.path));

  return (
    <div className="menu-item">
      <button
        className={`menu-button${isCurrent ? " is-current" : ""}`}
        aria-expanded={isOpen}
        aria-current={isCurrent ? "page" : undefined}
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
                  <li key={item.downloadPath ?? item.path}>
                    {item.downloadPath ? (
                      <button
                        type="button"
                        className="dropdown-download"
                        onClick={() => {
                          void downloadAuthenticatedFile(item.downloadPath!, item.downloadFilename).then((result) => {
                            if (!result.ok) {
                              showToast(result.error ?? "Download failed.", "error");
                              return;
                            }
                            onItemSelect?.();
                          });
                        }}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <NavLink
                        to={item.path}
                        className={() => (navItemIsCurrent(pathname, item.path, visiblePaths) ? "is-current" : undefined)}
                        aria-current={navItemIsCurrent(pathname, item.path, visiblePaths) ? "page" : undefined}
                        onMouseEnter={() => prefetchNavRoute(item.path)}
                        onFocus={() => prefetchNavRoute(item.path)}
                        onClick={() => {
                          onItemSelect?.();
                        }}
                      >
                        {item.label}
                      </NavLink>
                    )}
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
