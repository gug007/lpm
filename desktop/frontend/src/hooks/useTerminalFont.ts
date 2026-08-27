import { getSettings, useSettingsStore } from "../store/settings";
import { terminalFontStack } from "../components/terminal-utils";

export const DEFAULT_TERMINAL_LINE_HEIGHT = 1;
export const MIN_TERMINAL_LINE_HEIGHT = 1;
export const MAX_TERMINAL_LINE_HEIGHT = 2;

export interface TerminalFont {
  family?: string;
  fontFamily: string;
  lineHeight: number;
}

function clampLineHeight(value?: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_TERMINAL_LINE_HEIGHT;
  }
  return Math.min(
    MAX_TERMINAL_LINE_HEIGHT,
    Math.max(MIN_TERMINAL_LINE_HEIGHT, value),
  );
}

export function useTerminalFont(): TerminalFont {
  const family = useSettingsStore((s) => s.terminalFontFamily);
  const lineHeight = useSettingsStore((s) => clampLineHeight(s.terminalLineHeight));
  return { family, fontFamily: terminalFontStack(family), lineHeight };
}

export function getTerminalFont(): TerminalFont {
  const { terminalFontFamily, terminalLineHeight } = getSettings();
  return {
    family: terminalFontFamily,
    fontFamily: terminalFontStack(terminalFontFamily),
    lineHeight: clampLineHeight(terminalLineHeight),
  };
}
