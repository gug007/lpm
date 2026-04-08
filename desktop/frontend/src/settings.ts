import { LoadSettings, SaveSettings } from "../wailsjs/go/main/App";
import type { Theme } from "./theme";

export interface Settings {
  theme: Theme;
  doubleClickToToggle: boolean;
  soundNotifications?: boolean;
  projectOrder?: string[];
  terminalTheme?: string;
  terminalFontSize?: number;
  windowWidth?: number;
  windowHeight?: number;
  sidebarWidth?: number;
  autoGenerateCommitMessage?: boolean;
  autoGeneratePRDescription?: boolean;
}

const defaults: Settings = {
  theme: "system",
  doubleClickToToggle: false,
};

let cached: Settings = { ...defaults };

export async function loadSettings(): Promise<Settings> {
  try {
    const s = await LoadSettings();
    cached = {
      theme: (s.theme as Theme) || defaults.theme,
      doubleClickToToggle: s.doubleClickToToggle ?? defaults.doubleClickToToggle,
      soundNotifications: s.soundNotifications,
      projectOrder: s.projectOrder,
      terminalTheme: s.terminalTheme,
      terminalFontSize: s.terminalFontSize,
      windowWidth: s.windowWidth,
      windowHeight: s.windowHeight,
      sidebarWidth: s.sidebarWidth,
      autoGenerateCommitMessage: s.autoGenerateCommitMessage,
      autoGeneratePRDescription: s.autoGeneratePRDescription,
    };
  } catch {
    cached = { ...defaults };
  }
  return cached;
}

export function getSettings(): Settings {
  return cached;
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  const fresh = await LoadSettings();
  const merged: Settings = {
    theme: (partial.theme ?? fresh.theme ?? defaults.theme) as Theme,
    doubleClickToToggle:
      partial.doubleClickToToggle ?? fresh.doubleClickToToggle ?? defaults.doubleClickToToggle,
    soundNotifications: partial.soundNotifications ?? fresh.soundNotifications,
    projectOrder: partial.projectOrder ?? fresh.projectOrder,
    terminalTheme: partial.terminalTheme ?? fresh.terminalTheme,
    terminalFontSize: partial.terminalFontSize ?? fresh.terminalFontSize,
    windowWidth: partial.windowWidth ?? fresh.windowWidth,
    windowHeight: partial.windowHeight ?? fresh.windowHeight,
    sidebarWidth: partial.sidebarWidth ?? fresh.sidebarWidth,
    autoGenerateCommitMessage: partial.autoGenerateCommitMessage ?? fresh.autoGenerateCommitMessage,
    autoGeneratePRDescription: partial.autoGeneratePRDescription ?? fresh.autoGeneratePRDescription,
  };
  cached = merged;
  await SaveSettings(merged);
}
