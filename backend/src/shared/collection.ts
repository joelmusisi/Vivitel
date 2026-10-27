export function resolveByNameOrId(items: any[], value: string): any {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return (
    items.find((item) => String(item.id ?? "").trim().toLowerCase() === needle)
    || items.find((item) => String(item.name ?? "").trim().toLowerCase() === needle)
    || null
  );
}
