import { getThemePreference, toggleThemePreference, THEME_CHANGE_EVENT, type ThemePreference } from "../utils/themeMode";
import { useEffect, useState } from "react";

type ThemeToggleButtonProps = {
  compact?: boolean;
  className?: string;
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
    </svg>
  );
}

export default function ThemeToggleButton({ compact = false, className = "" }: ThemeToggleButtonProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => {
    const sync = () => setTheme(getThemePreference());
    window.addEventListener("storage", sync);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  const nextLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " theme-toggle--compact" : ""} ${className}`.trim()}
      aria-label={nextLabel}
      title={`${nextLabel} (saved for your account)`}
      onClick={() => setTheme(toggleThemePreference())}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      {!compact && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
