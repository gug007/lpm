import { LoadSettings, SaveSettings } from "../wailsjs/go/main/App";
import type { Theme } from "./theme";

export type GitPullStrategy = "ff-only" | "merge" | "rebase";

export const DEFAULT_PULL_STRATEGY: GitPullStrategy = "ff-only";

export interface Settings {
  theme: Theme;
  doubleClickToToggle: boolean;
  soundNotifications?: boolean;
  projectOrder?: string[];
  terminalTheme?: string;
  terminalFontSize?: number;
  editorFontSize?: number;
  windowWidth?: number;
  windowHeight?: number;
  sidebarWidth?: number;
  autoGenerateCommitMessage?: boolean;
  autoGeneratePRDescription?: boolean;
  configEditorMode?: "form" | "yaml";
  showProjectName?: boolean;
  lastSelectedProject?: string;
  gitPullStrategy?: GitPullStrategy;
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
      editorFontSize: s.editorFontSize,
      windowWidth: s.windowWidth,
      windowHeight: s.windowHeight,
      sidebarWidth: s.sidebarWidth,
      autoGenerateCommitMessage: s.autoGenerateCommitMessage,
      autoGeneratePRDescription: s.autoGeneratePRDescription,
      configEditorMode: s.configEditorMode === "form" || s.configEditorMode === "yaml" ? s.configEditorMode : undefined,
      showProjectName: s.showProjectName,
      lastSelectedProject: s.lastSelectedProject,
      gitPullStrategy:
        s.gitPullStrategy === "merge" || s.gitPullStrategy === "rebase" || s.gitPullStrategy === "ff-only"
          ? s.gitPullStrategy
          : undefined,
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
