import { create } from "zustand";
import { LoadSettings, SaveSettings } from "../../bridge/commands";
import type { main } from "../../bridge/models";
import type { Theme } from "../theme";

export const GIT_PULL_STRATEGIES = ["ff-only", "merge", "rebase"] as const;

export type GitPullStrategy = (typeof GIT_PULL_STRATEGIES)[number];

export const DEFAULT_PULL_STRATEGY: GitPullStrategy = "ff-only";

function isGitPullStrategy(value: string | undefined): value is GitPullStrategy {
  return !!value && (GIT_PULL_STRATEGIES as readonly string[]).includes(value);
}

export interface DetachedWindowState {
  detached: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface Settings {
  theme: Theme;
  browserTheme?: "light" | "dark"; // unset = follow the app theme

  doubleClickToToggle: boolean;
  soundNotifications?: boolean;
  projectOrder?: string[];
  terminalTheme?: string;
  terminalFontSize?: number;
  terminalOpenInDefaultApp?: boolean;
  editorFontSize?: number;
  windowWidth?: number;
  windowHeight?: number;
  sidebarWidth?: number;
  autoGenerateCommitMessage?: boolean;
  autoGeneratePRDescription?: boolean;
  aiCli?: string;
  aiModel?: string;
  aiEffort?: string;
  aiFast?: boolean;
  configEditorMode?: "form" | "yaml";
  showProjectName?: boolean;
  lastSelectedProject?: string;
  gitPullStrategy?: GitPullStrategy;
  experimentalTTS?: boolean;
  ttsEnabled?: boolean;
  ttsVoice?: string;
  ttsSpeed?: number;
  preferredEditor?: string;
  detachedWindows?: Record<string, DetachedWindowState>;
}

const defaults: Settings = {
  theme: "dark",
  doubleClickToToggle: false,
};

interface SettingsActions {
  hydrate: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

type SettingsState = Settings & SettingsActions;

// Empty strings from the backend binding collapse to undefined so consumers
// can rely on `value ?? fallback` and on truthiness checks.
function normalize(s: main.Settings): Settings {
  return {
    theme: (s.theme as Theme) || defaults.theme,
    browserTheme:
      s.browserTheme === "light" || s.browserTheme === "dark" ? s.browserTheme : undefined,
    doubleClickToToggle: s.doubleClickToToggle ?? defaults.doubleClickToToggle,
    soundNotifications: s.soundNotifications,
    projectOrder: s.projectOrder,
    terminalTheme: s.terminalTheme,
    terminalFontSize: s.terminalFontSize,
    terminalOpenInDefaultApp: s.terminalOpenInDefaultApp,
    editorFontSize: s.editorFontSize,
    windowWidth: s.windowWidth,
    windowHeight: s.windowHeight,
    sidebarWidth: s.sidebarWidth,
    autoGenerateCommitMessage: s.autoGenerateCommitMessage,
    autoGeneratePRDescription: s.autoGeneratePRDescription,
    aiCli: s.aiCli || undefined,
    aiModel: s.aiModel || undefined,
    aiEffort: s.aiEffort || undefined,
    aiFast: s.aiFast,
    configEditorMode:
      s.configEditorMode === "form" || s.configEditorMode === "yaml"
        ? s.configEditorMode
        : undefined,
    showProjectName: s.showProjectName,
    lastSelectedProject: s.lastSelectedProject,
    gitPullStrategy: isGitPullStrategy(s.gitPullStrategy) ? s.gitPullStrategy : undefined,
    experimentalTTS: s.experimentalTTS,
    ttsEnabled: s.ttsEnabled,
    ttsVoice: s.ttsVoice || undefined,
    ttsSpeed: s.ttsSpeed,
    preferredEditor: s.preferredEditor || undefined,
    detachedWindows: s.detachedWindows
      ? Object.fromEntries(
          Object.entries(s.detachedWindows).map(([name, raw]) => {
            const st = raw as Partial<DetachedWindowState> | undefined;
            return [
              name,
              {
                detached: !!st?.detached,
                x: st?.x,
                y: st?.y,
                width: st?.width,
                height: st?.height,
              },
            ];
          }),
        )
      : undefined,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,

  hydrate: async () => {
    try {
      const loaded = await LoadSettings();
      set(normalize(loaded));
    } catch {
      set({ ...defaults });
    }
  },

  // Re-loads from disk before merging so concurrent writers don't clobber
  // each other on independent fields.
  update: async (partial) => {
    const cur = get();
    const dirty = (Object.keys(partial) as (keyof Settings)[]).some(
      (k) => cur[k] !== partial[k],
    );
    if (!dirty) return;
    const fresh = await LoadSettings();
    const merged: Settings = { ...defaults, ...normalize(fresh), ...partial };
    await SaveSettings(merged);
    set(merged);
  },
}));

function snapshot(): Settings {
  const { hydrate: _h, update: _u, ...values } = useSettingsStore.getState();
  return values;
}

// Snapshot accessors for callers outside React render paths (audio
// helpers, monaco link providers, event handlers). React components
// should subscribe with useSettingsStore directly.
export function getSettings(): Settings {
  return snapshot();
}

export async function loadSettings(): Promise<Settings> {
  await useSettingsStore.getState().hydrate();
  return snapshot();
}

export function saveSettings(partial: Partial<Settings>): Promise<void> {
  return useSettingsStore.getState().update(partial);
}
