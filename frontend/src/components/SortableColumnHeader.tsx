import type { CSSProperties, ReactNode } from "react";
import type { SortDirection } from "../utils/tableSort";

type SortableColumnHeaderProps = {
  label: ReactNode;
  active?: boolean;
  direction?: SortDirection | null;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "span" | "th" | "button";
  "aria-sort"?: "ascending" | "descending" | "none";
  title?: string;
};

export default function SortableColumnHeader({
  label,
  active = false,
  direction = null,
  onClick,
  className = "",
  style,
  as = "div",
  "aria-sort": ariaSort = "none",
  title
}: SortableColumnHeaderProps) {
  const classes = ["sortable-col-header", active ? "is-active" : "", className]
    .filter(Boolean)
    .join(" ");
  const indicator = active ? (direction === "desc" ? "▼" : "▲") : "";
  const Tag = as === "button" ? "button" : as;

  if (Tag === "button") {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        aria-sort={ariaSort}
        title={title || (typeof label === "string" ? `Sort by ${label}` : "Sort column")}
      >
        <span className="sortable-col-label">{label}</span>
        {indicator ? <span className="sortable-col-indicator" aria-hidden="true">{indicator}</span> : null}
      </button>
    );
  }

  if (Tag === "th") {
    return (
      <th
        className={classes}
        style={style}
        onClick={onClick}
        aria-sort={ariaSort}
        title={title || (typeof label === "string" ? `Sort by ${label}` : "Sort column")}
        role="columnheader"
      >
        <span className="sortable-col-label">{label}</span>
        {indicator ? <span className="sortable-col-indicator" aria-hidden="true">{indicator}</span> : null}
      </th>
    );
  }

  if (Tag === "span") {
    return (
      <span
        className={classes}
        style={style}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick?.();
          }
        }}
        aria-sort={ariaSort}
        title={title || (typeof label === "string" ? `Sort by ${label}` : "Sort column")}
        role="columnheader"
        tabIndex={0}
      >
        <span className="sortable-col-label">{label}</span>
        {indicator ? <span className="sortable-col-indicator" aria-hidden="true">{indicator}</span> : null}
      </span>
    );
  }

  return (
    <div
      className={classes}
      style={style}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      aria-sort={ariaSort}
      title={title || (typeof label === "string" ? `Sort by ${label}` : "Sort column")}
      role="columnheader"
      tabIndex={0}
    >
      <span className="sortable-col-label">{label}</span>
      {indicator ? <span className="sortable-col-indicator" aria-hidden="true">{indicator}</span> : null}
    </div>
  );
}
