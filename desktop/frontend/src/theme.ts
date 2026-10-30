import { useSyncExternalStore } from "react";
import { useEventListener } from "./hooks/useEventListener";
import { useSettingsStore } from "./store/settings";

export type Theme = "light" | "dark" | "system";

const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const subscribeDarkMode = (onChange: () => void) => {
  darkModeQuery.addEventListener("change", onChange);
  return () => darkModeQuery.removeEventListener("change", onChange);
};

const getSystemDark = () => darkModeQuery.matches;

export function isDarkTheme(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && getSystemDark());
}

/// Re-renders on both the stored setting and the OS appearance, so "system"
/// keeps following the OS instead of freezing at whatever it was on mount.
export function useResolvedTheme(): "light" | "dark" {
  const theme = useSettingsStore((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribeDarkMode, getSystemDark);
  return theme === "dark" || (theme === "system" && systemDark)
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): boolean {
  const dark = isDarkTheme(theme);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  return dark;
}

/// Keeps the page on the OS appearance while the theme is "system", wherever
/// the app is, not only while Settings is open.
export function useSystemThemeSync(): void {
  const theme = useSettingsStore((s) => s.theme);
  useEventListener("change", () => applyTheme("system"), darkModeQuery, theme === "system");
}
