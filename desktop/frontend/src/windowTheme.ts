import { setTheme } from "@tauri-apps/api/app";
import { logDiagnostic } from "./diagnostics";
import { platform, type Platform } from "./platform";
import type { Theme } from "./theme";

export type NativeTheme = "light" | "dark" | null;

// The theme Linux and Windows draw lpm's title bars, native dialogs and (on
// Windows) its webviews in, so the frame matches the page; undefined leaves it
// as it is. macOS keeps its overlay title bar and appearance. Windows reads null
// as "follow the system". GTK reads null as light, so on Linux System puts back
// what the desktop said before lpm first chose a theme, and if lpm never chose
// one there is nothing to put back.
export function nativeTheme(
  theme: Theme,
  p: Platform,
  desktopDarkBeforeOverride: boolean | null,
): NativeTheme | undefined {
  if (p === "macos") return undefined;
  if (theme !== "system") return theme;
  if (p === "windows") return null;
  if (desktopDarkBeforeOverride === null) return undefined;
  return desktopDarkBeforeOverride ? "dark" : "light";
}

const desktopDark =
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
let overridden = false;
let applied: NativeTheme | undefined;

// The theme is the app's, so every window follows whichever one sets it, and a
// window opened later starts in it.
export function syncNativeTheme(theme: Theme): void {
  const next = nativeTheme(theme, platform, overridden ? desktopDark : null);
  if (next === undefined || next === applied) return;
  applied = next;
  if (next !== null) overridden = true;
  setTheme(next).catch((err: unknown) => {
    applied = undefined;
    logDiagnostic("warn", "app.native_theme_failed", "Could not set the window theme", {
      theme: next,
      error: String(err),
    });
  });
}
