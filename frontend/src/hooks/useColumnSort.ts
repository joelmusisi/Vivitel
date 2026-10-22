import { useMemo, useState } from "react";
import {
  sortRowsByColumn,
  toggleSortState,
  type ColumnSortState,
  type SortDirection,
  type SortValueGetter
} from "../utils/tableSort";

export type UseColumnSortOptions<T, Key extends string> = {
  rows: T[];
  getValue: SortValueGetter<T, Key>;
  initialSort?: ColumnSortState<Key> | null;
};

export type SortableHeaderProps = {
  onClick: () => void;
  "aria-sort": "ascending" | "descending" | "none";
  active: boolean;
  direction: SortDirection | null;
};

export function useColumnSort<T, Key extends string = string>(options: UseColumnSortOptions<T, Key>) {
  const { rows, getValue, initialSort = null } = options;
  const [sort, setSort] = useState<ColumnSortState<Key> | null>(initialSort);

  const sortedRows = useMemo(
    () => sortRowsByColumn(rows, sort, getValue),
    [rows, sort, getValue]
  );

  const sortBy = (key: Key) => {
    setSort((current) => toggleSortState(current, key));
  };

  const getHeaderProps = (key: Key): SortableHeaderProps => {
    const active = sort?.key === key;
    const direction = active ? sort.direction : null;
    return {
      onClick: () => sortBy(key),
      "aria-sort": active ? (direction === "desc" ? "descending" : "ascending") : "none",
      active,
      direction
    };
  };

  return {
    sort,
    setSort,
    sortedRows,
    sortBy,
    getHeaderProps
  };
}
