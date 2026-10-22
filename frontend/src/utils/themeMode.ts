export type ThemePreference = "light" | "dark";

const THEME_KEY = "vivi.theme";
export const THEME_CHANGE_EVENT = "vivi-theme-change";

type PersistAccountFn = (theme: ThemePreference) => void | Promise<void>;

let persistAccountTheme: PersistAccountFn | null = null;

export function registerThemeAccountPersister(fn: PersistAccountFn | null): void {
  persistAccountTheme = fn;
}

export function getThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = String(window.localStorage.getItem(THEME_KEY) ?? "").trim().toLowerCase();
  if (stored === "dark" || stored === "light") return stored;
  // Default is light for every account until the user opts into dark mode.
  return "light";
}

export function setThemePreference(
  theme: ThemePreference,
  options?: { persistAccount?: boolean }
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  if (options?.persistAccount !== false && persistAccountTheme) {
    void persistAccountTheme(theme);
  }
}

export function toggleThemePreference(): ThemePreference {
  const next: ThemePreference = getThemePreference() === "dark" ? "light" : "dark";
  setThemePreference(next);
  return next;
}

export function applyTheme(theme: ThemePreference = getThemePreference()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function initTheme(): void {
  applyTheme(getThemePreference());
}

/** Apply a theme loaded from the signed-in account without writing back to the server. */
export function applyAccountTheme(theme: ThemePreference | string | null | undefined): void {
  const next: ThemePreference = String(theme ?? "").trim().toLowerCase() === "dark" ? "dark" : "light";
  setThemePreference(next, { persistAccount: false });
}
