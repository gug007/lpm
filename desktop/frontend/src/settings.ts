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
  configEditorMode?: "form" | "yaml";
  showProjectName?: boolean;
  lastSelectedProject?: string;
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
      configEditorMode: s.configEditorMode === "form" || s.configEditorMode === "yaml" ? s.configEditorMode : undefined,
      showProjectName: s.showProjectName,
      lastSelectedProject: s.lastSelectedProject,
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
  const merged = { ...defaults, ...fresh, ...partial } as Settings;
  cached = merged;
  await SaveSettings(merged);
}
