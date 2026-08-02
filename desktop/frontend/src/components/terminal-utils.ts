import { BrowserOpenURL } from "../../bridge/runtime";
import { ansiColors } from "./terminal-colors";

export { ansiColors };

export const openTerminalLink = (_e: MouseEvent, uri: string) => BrowserOpenURL(uri);

export const TERMINAL_FONT_FAMILY =
  "'SF Mono', Menlo, Monaco, 'Courier New', 'Segoe UI Emoji', 'Noto Color Emoji', monospace";

// Fitting while the host is collapsed (hidden tab, mid-layout flex transition)
// would shrink the terminal to xterm's 2-col minimum and garble everything
// written after; skip and let the ResizeObserver refit once the host reaches a
// usable size.
const MIN_FIT_WIDTH_PX = 64;
const MIN_FIT_HEIGHT_PX = 24;

export function canFitHost(host: HTMLElement): boolean {
  return host.clientWidth >= MIN_FIT_WIDTH_PX && host.clientHeight >= MIN_FIT_HEIGHT_PX;
}

export interface TerminalThemeStyle {
  background: string;
  foreground: string;
  selectionBackground: string;
  cursor: string;
}

export function getTerminalTheme(
  el?: Element | null,
): TerminalThemeStyle & typeof ansiColors {
  const style = getComputedStyle(el || document.documentElement);
  return {
    background: style.getPropertyValue("--terminal-bg").trim() || "#0d0d0d",
    foreground: style.getPropertyValue("--terminal-fg").trim() || "#cccccc",
    selectionBackground: style.getPropertyValue("--terminal-selection").trim() || "#444444",
    cursor: style.getPropertyValue("--terminal-cursor").trim() || "#cccccc",
    ...ansiColors,
  };
}
