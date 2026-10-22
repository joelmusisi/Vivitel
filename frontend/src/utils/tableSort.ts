export type SortDirection = "asc" | "desc";

export type ColumnSortState<Key extends string = string> = {
  key: Key;
  direction: SortDirection;
};

export type SortValueGetter<T, Key extends string = string> = (row: T, key: Key) => unknown;

const toComparableNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate) && /[/-]|\d{1,2}:\d{2}/.test(raw)) return asDate;
  return null;
};

/** Compare two cell values: numbers/dates numerically, otherwise case-insensitive text. */
export function compareSortValues(left: unknown, right: unknown): number {
  const leftEmpty = left == null || String(left).trim() === "";
  const rightEmpty = right == null || String(right).trim() === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const leftNum = toComparableNumber(left);
  const rightNum = toComparableNumber(right);
  if (leftNum != null && rightNum != null) {
    if (leftNum < rightNum) return -1;
    if (leftNum > rightNum) return 1;
    return 0;
  }

  return String(left).localeCompare(String(right), undefined, {
    sensitivity: "base",
    numeric: true
  });
}

export function toggleSortState<Key extends string>(
  current: ColumnSortState<Key> | null,
  nextKey: Key
): ColumnSortState<Key> {
  if (current?.key === nextKey) {
    return { key: nextKey, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: nextKey, direction: "asc" };
}

export function sortRowsByColumn<T, Key extends string = string>(
  rows: T[],
  sort: ColumnSortState<Key> | null | undefined,
  getValue: SortValueGetter<T, Key>
): T[] {
  if (!sort?.key) return rows;
  const direction = sort.direction === "desc" ? -1 : 1;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((a, b) => {
    const cmp = compareSortValues(getValue(a.row, sort.key), getValue(b.row, sort.key));
    if (cmp !== 0) return cmp * direction;
    return a.index - b.index;
  });
  return indexed.map((item) => item.row);
}
