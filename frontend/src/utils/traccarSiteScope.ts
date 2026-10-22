/** @deprecated Site is not part of settings definitions; kept for legacy scoped-id parsing only. */

export const slugTraccarScopeToken = (value: string) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
