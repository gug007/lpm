import { useSyncExternalStore } from "react";
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
