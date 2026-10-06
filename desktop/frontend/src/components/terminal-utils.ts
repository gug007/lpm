import type { Terminal } from "@xterm/xterm";
import { BrowserOpenURL } from "../../bridge/runtime";
import { ansiColors } from "./terminal-colors";
import { isLinux } from "../platform";

export { ansiColors };

export const openTerminalLink = (_e: MouseEvent, uri: string) => BrowserOpenURL(uri);

// Linux has none of the Mac fonts, and fontconfig answers 'Courier New' with a
// Courier clone (Nimbus Mono PS) whose ascent overflows the cell, clipping the
// first row; the usual Linux monospace fonts stand in for both there.
export const TERMINAL_FONT_FAMILY = isLinux
  ? "'DejaVu Sans Mono', 'Liberation Mono', 'Noto Sans Mono', 'Noto Color Emoji', monospace"
  : "'SF Mono', Menlo, Monaco, 'Courier New', 'Segoe UI Emoji', 'Noto Color Emoji', monospace";

// A chosen font always keeps the default stack behind it, so a missing family
// still renders and the emoji fallbacks stay reachable for glyphs it lacks.
export function terminalFontStack(family?: string): string {
  const name = family?.trim().replace(/'/g, "");
  if (!name) return TERMINAL_FONT_FAMILY;
  return `'${name}', ${TERMINAL_FONT_FAMILY}`;
}

// Fitting while the host is collapsed (hidden tab, mid-layout flex transition)
// would shrink the terminal to xterm's 2-col minimum and garble everything
// written after; skip and let the ResizeObserver refit once the host reaches a
// usable size.
const MIN_FIT_WIDTH_PX = 64;
const MIN_FIT_HEIGHT_PX = 24;

export function canFitHost(host: HTMLElement): boolean {
  return host.clientWidth >= MIN_FIT_WIDTH_PX && host.clientHeight >= MIN_FIT_HEIGHT_PX;
}

export function isAtBottom(term: Terminal): boolean {
  const buf = term.buffer.active;
  return buf.viewportY >= buf.baseY;
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
