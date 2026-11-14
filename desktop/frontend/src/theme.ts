import { useSyncExternalStore } from "react";
import { useEventListener } from "./hooks/useEventListener";
import { useSettingsStore } from "./store/settings";
import { syncNativeTheme } from "./windowTheme";

export type Theme = "light" | "dark" | "system";

// Asked for on first use, so importing this where there is no window (the
// terminal theme hook, in node tests) doesn't throw.
let darkModeQuery: MediaQueryList | undefined;
const darkMode = () => (darkModeQuery ??= window.matchMedia("(prefers-color-scheme: dark)"));

const subscribeDarkMode = (onChange: () => void) => {
  darkMode().addEventListener("change", onChange);
  return () => darkMode().removeEventListener("change", onChange);
};

const getSystemDark = () => darkMode().matches;

export function isDarkTheme(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && getSystemDark());
}

/// Re-renders on both the stored setting and the OS appearance, so "system"
/// keeps following the OS instead of freezing at whatever it was on mount.
export function useResolvedTheme(): "light" | "dark" {
  return useAppearanceOf(useSettingsStore((s) => s.theme));
}

/// The same for a theme setting that may be another machine's; "system" reads
/// this machine's OS, the nearest guess there is for it.
export function useAppearanceOf(theme: Theme): "light" | "dark" {
  const systemDark = useSyncExternalStore(subscribeDarkMode, getSystemDark);
  return theme === "dark" || (theme === "system" && systemDark)
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): boolean {
  const dark = isDarkTheme(theme);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  syncNativeTheme(theme);
  return dark;
}

/// Keeps the page on the OS appearance while the theme is "system", wherever
/// the app is, not only while Settings is open.
export function useSystemThemeSync(): void {
  const theme = useSettingsStore((s) => s.theme);
  useEventListener("change", () => applyTheme("system"), darkMode(), theme === "system");
}
