import { create } from "zustand";
import { LoadSettings, SaveSettings } from "../../bridge/commands";
import type { main } from "../../bridge/models";
import type { GenerateApprovalMode } from "../generate";
import type { Theme } from "../theme";
import type { RunMode } from "../types";
import {
  normalizeGitPull,
  normalizeGitPush,
  normalizeGitFetch,
  type GitPullConfig,
  type GitPushConfig,
  type GitFetchConfig,
} from "../gitOptions";
import { normalizeHotkeys, type HotkeysConfig } from "../hotkeys";
import { normalizeQuickTerminal, type QuickTerminalSetting } from "../quickTerminalKeys";
import { USAGE_TOOLS, type UsageWindowChoice } from "../sidebarUsage";
import { normalizeSidebarNav, type NavItemId } from "../sidebarNav";
import { normalizeRowLayout, type SidebarRowLayout } from "../sidebarRowLayout";
import { normalizePaneToolbar, type PaneActionId } from "../paneActions";
import {
  normalizeComposerToolTimes,
  normalizeComposerToolbar,
  type ComposerToolId,
  type ComposerToolTimes,
} from "../composerTools";
import type { PeerRowOrder } from "../components/peerRowOrder";
import { normalizeRecapTheme, type RecapTheme } from "../components/recap/recapCardTheme";
import { normalizeRecapRows, type RecapRow } from "../components/recap/weeklyRecapModel";
import type { SideBySideLayout } from "../sideBySide";
import { normalizeSavedLayouts, type SavedLayoutsConfig } from "../savedLayouts";
import { normalizeAutoPullMode, type AutoPullMode } from "../autoPull";
import { isArchiveAfter } from "../archiveAfter";
import type { NotificationChannelPrefs } from "../notifications/channels";
import { isTerminalThemeMode, type TerminalThemeMode } from "../terminalThemeChoice";
import { isImportedTheme, type ImportedTerminalTheme } from "../importedTheme";
import { setImportedTheme } from "../terminal-themes";

export interface DetachedWindowState {
  detached: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export type FilesTreeSide = "left" | "right";

export type UpdateChannel = "stable" | "beta";
function isGenerateApproval(v: unknown): v is GenerateApprovalMode {
  return v === "each" || v === "project" || v === "always";
}

export type VideoNarrator = "local" | "openai";

export const DEFAULT_KEEP_FINISHED_AGENTS = true;
export const DEFAULT_SEEN_SHOWN = 5;
export const SEEN_SHOWN_MIN = 1;
export const SEEN_SHOWN_MAX = 10;

export interface Settings {
  theme: Theme;
  browserTheme?: "light" | "dark"; // unset = follow the app theme
  // How big lpm draws its own pages, as a zoom (0.9–1.25); unset is 100%.
  // This computer's alone: a paired one never shares it (peersettings.rs).
  interfaceSize?: number;

  doubleClickToToggle: boolean;
  defaultProjectDirectory?: string;
  soundNotifications?: boolean;
  systemNotifications?: boolean;
  // Where each kind of notification reaches you. Unset means each event's
  // default, after the two switches above.
  notificationChannels?: NotificationChannelPrefs;
  // Toasts wait while the composer is being typed in.
  holdToastsWhileTyping?: boolean;
  // How many agents need you, on the Dock or taskbar icon. Unset means on.
  appIconBadge?: boolean;
  doneSound?: string;
  waitingSound?: string;
  errorSound?: string;
  projectOrder?: string[];
  sidebarOrder?: string[];
  // Projects kept at the top of the sidebar, in their pinned order; ⌘1–⌘9
  // reach these first.
  pinnedProjects?: string[];
  peerProjectOrder?: PeerRowOrder;
  terminalTheme?: string;
  // Unset means "single": terminalTheme everywhere. "follow" uses
  // terminalThemeDark or terminalThemeLight as the app is dark or light.
  terminalThemeMode?: TerminalThemeMode;
  terminalThemeDark?: string;
  terminalThemeLight?: string;
  // Colors brought over from another terminal, drawn as the "imported" theme.
  terminalImportedTheme?: ImportedTerminalTheme;
  terminalFontSize?: number;
  terminalFontFamily?: string;
  terminalLineHeight?: number;
  terminalOpenInDefaultApp?: boolean;
  // The shell new plain terminals open in (shells.rs); unset is the login shell.
  terminalShell?: string;
  editorFontSize?: number;
  windowWidth?: number;
  windowHeight?: number;
  sidebarWidth?: number;
  // Which footer nav items sit in the sidebar itself; the rest are in the More
  // menu. Unset means the default layout.
  sidebarNavInSidebar?: NavItemId[];
  // Which details each project row shows and where. Unset is the classic row.
  sidebarRowLayout?: SidebarRowLayout;
  // Which pane actions have a button in the pane header; the rest are in its
  // menu. Unset means the default layout.
  paneToolbar?: PaneActionId[];
  // Which terminal-input tools have a button under the field; the rest are in
  // its More menu. Unset means the default layout.
  composerToolbar?: ComposerToolId[];
  // The tools that row had to choose from when it was saved, so a tool added
  // since can take its default seat. Unset for a row saved before this was kept.
  composerToolbarKnown?: ComposerToolId[];
  // When each new composer tool stops wearing its New dot.
  composerToolsNewUntil?: ComposerToolTimes;
  // Named pane arrangements per project (savedLayouts.ts), and which one opens
  // by itself.
  savedLayouts?: SavedLayoutsConfig;
  // Which side of the Files tab holds the folder tree. Unset means the right.
  filesTreeSide?: FilesTreeSide;
  autoGenerateCommitMessage?: boolean;
  autoGeneratePRDescription?: boolean;
  claudeLimitsEnabled?: boolean;
  usageInSidebar?: boolean;
  usageSidebarTools?: string[];
  usageSidebarWindow?: UsageWindowChoice;
  aiCli?: string;
  aiModel?: string;
  aiEffort?: string;
  aiFast?: boolean;
  configEditorMode?: "form" | "yaml";
  showProjectName?: boolean;
  lastSelectedProject?: string;
  gitPull?: GitPullConfig;
  gitPush?: GitPushConfig;
  gitFetch?: GitFetchConfig;
  // Fetch in the background and mark projects whose branch on origin moved on.
  // Unset means on.
  checkOrigin?: boolean;
  // Which projects fast-forward on their own after that check. Unset means off.
  autoPull?: AutoPullMode;
  // Put Linux hosts on this app's release once nothing is running on them.
  // Unset means on.
  autoUpdateHosts?: boolean;
  // Install this app's updates by itself once nobody is at the Mac and nothing
  // would be cut off. Unset means off.
  installUpdatesWhenIdle?: boolean;
  // Which releases this app updates to. Unset means stable.
  updateChannel?: UpdateChannel;
  // Send crash reports from this machine (crashReports.ts, crashreport.rs).
  // Unset means on, and it is kept per machine.
  crashReports?: boolean;
  // Send the daily ping that counts active computers (dailyping.rs). Unset
  // means on, and it is kept per machine.
  dailyPing?: boolean;
  // Opening a finished agent keeps its sidebar row, muted, until it is
  // archived (status/seen.rs). Unset means on.
  keepFinishedAgents?: boolean;
  // How long a seen agent stays before it archives itself: "never", or an
  // amount and a unit such as "90m" (archiveAfter.ts). Unset means an hour.
  autoArchiveAgentsAfter?: string;
  // How many seen agents a project lists before the rest fold. Unset means 5.
  seenAgentsShown?: number;
  experimentalTTS?: boolean;
  ttsEnabled?: boolean;
  ttsEngine?: string;
  ttsOpenAiVoice?: string;
  ttsVoice?: string;
  ttsSpeed?: number;
  // Settings › Images & speech, read by `lpm generate` (generate/mod.rs). Unset
  // means ask once per project, a $2 daily limit (0 is none), Nano Banana 2.1,
  // the Marin voice, and generated/ kept out of Git.
  generateApproval?: GenerateApprovalMode;
  generateDailyLimit?: number;
  generateImageModel?: string;
  generateVoice?: string;
  generateKeepOutOfGit?: boolean;
  // Who narrates video answers, passed to explaincast as EXPLAINCAST_VOICE in
  // new terminals (video_settings.rs). Unset leaves explaincast's own default,
  // the voice on this Mac.
  videoNarrator?: VideoNarrator;
  videoLocalVoice?: string;
  videoCloudVoice?: string;
  preferredEditor?: string;
  detachedWindows?: Record<string, DetachedWindowState>;
  searchFilterMode?: boolean;
  duplicateExcludeUncommitted?: boolean;
  duplicateReinstallDeps?: boolean;
  duplicatePullLatest?: boolean;
  duplicateRunMode?: RunMode;
  duplicateActionName?: string;
  duplicateCommand?: string;
  duplicateRunSectionOpen?: boolean;
  duplicateOptionsSectionOpen?: boolean;
  runInDuplicatesSideBySide?: boolean;
  runInDuplicatesLayout?: SideBySideLayout;
  composerOpen?: boolean;
  autoCloseComposerOnSend?: boolean;
  // + and ⌘T open the agent, model and level popup instead of a terminal.
  pickAgentOnNewTab?: boolean;
  appTipsDismissed?: boolean;
  // Last week's recap on Mondays: a card at the top of Stats and one toast.
  // Unset means on.
  weeklyRecap?: boolean;
  // The week whose card was hidden from Stats, and the week already toasted.
  weeklyRecapHidden?: string;
  weeklyRecapToasted?: string;
  // How the card is shared: its theme (dark when unset) and the rows left off.
  weeklyRecapTheme?: RecapTheme;
  weeklyRecapLeftOut?: RecapRow[];
  // The day lpm first ran with the GitHub star ask, and whether it was asked.
  githubStarSince?: string;
  githubStarAsked?: boolean;
  // The account signed in to `gh` has starred lpm: no more asking.
  githubStarred?: boolean;
  // The last Codex status line arranged by hand (no layout matches), kept so
  // switching to a layout and back doesn't lose it.
  codexStatusLineCustomItems?: string[];
  hotkeys?: HotkeysConfig;
  // The key that drops a terminal over any app. Unset means off.
  quickTerminal?: QuickTerminalSetting;
}

const defaults: Settings = {
  theme: "dark",
  doubleClickToToggle: false,
  soundNotifications: true,
  systemNotifications: true,
  holdToastsWhileTyping: true,
  autoCloseComposerOnSend: true,
  usageInSidebar: true,
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
      s.browserTheme === "light" || s.browserTheme === "dark"
        ? s.browserTheme
        : undefined,
    interfaceSize: typeof s.interfaceSize === "number" ? s.interfaceSize : undefined,
    doubleClickToToggle: s.doubleClickToToggle ?? defaults.doubleClickToToggle,
    defaultProjectDirectory: s.defaultProjectDirectory || undefined,
    soundNotifications: s.soundNotifications ?? defaults.soundNotifications,
    systemNotifications: s.systemNotifications ?? defaults.systemNotifications,
    notificationChannels: s.notificationChannels,
    holdToastsWhileTyping: s.holdToastsWhileTyping ?? defaults.holdToastsWhileTyping,
    appIconBadge: s.appIconBadge,
    doneSound: s.doneSound || undefined,
    waitingSound: s.waitingSound || undefined,
    errorSound: s.errorSound || undefined,
    projectOrder: s.projectOrder,
    sidebarOrder: s.sidebarOrder,
    pinnedProjects: Array.isArray(s.pinnedProjects)
      ? s.pinnedProjects.filter((name: unknown): name is string => typeof name === "string")
      : undefined,
    peerProjectOrder: s.peerProjectOrder,
    terminalTheme: s.terminalTheme,
    terminalThemeMode: isTerminalThemeMode(s.terminalThemeMode) ? s.terminalThemeMode : undefined,
    terminalThemeDark: s.terminalThemeDark || undefined,
    terminalThemeLight: s.terminalThemeLight || undefined,
    terminalImportedTheme: isImportedTheme(s.terminalImportedTheme) ? s.terminalImportedTheme : undefined,
    terminalFontSize: s.terminalFontSize,
    terminalFontFamily: s.terminalFontFamily || undefined,
    terminalLineHeight: s.terminalLineHeight,
    terminalOpenInDefaultApp: s.terminalOpenInDefaultApp,
    terminalShell: s.terminalShell || undefined,
    editorFontSize: s.editorFontSize,
    windowWidth: s.windowWidth,
    windowHeight: s.windowHeight,
    sidebarWidth: s.sidebarWidth,
    sidebarNavInSidebar: normalizeSidebarNav(s.sidebarNavInSidebar),
    sidebarRowLayout: s.sidebarRowLayout ? normalizeRowLayout(s.sidebarRowLayout) : undefined,
    paneToolbar: normalizePaneToolbar(s.paneToolbar),
    composerToolbar: normalizeComposerToolbar(s.composerToolbar),
    composerToolbarKnown: normalizeComposerToolbar(s.composerToolbarKnown),
    composerToolsNewUntil: normalizeComposerToolTimes(s.composerToolsNewUntil),
    savedLayouts: normalizeSavedLayouts(s.savedLayouts),
    filesTreeSide: s.filesTreeSide === "left" || s.filesTreeSide === "right" ? s.filesTreeSide : undefined,
    autoGenerateCommitMessage: s.autoGenerateCommitMessage,
    autoGeneratePRDescription: s.autoGeneratePRDescription,
    claudeLimitsEnabled: s.claudeLimitsEnabled,
    usageInSidebar: s.usageInSidebar ?? defaults.usageInSidebar,
    usageSidebarTools: Array.isArray(s.usageSidebarTools)
      ? USAGE_TOOLS.filter((tool) => s.usageSidebarTools.includes(tool))
      : undefined,
    usageSidebarWindow:
      s.usageSidebarWindow === "fiveHour" ||
      s.usageSidebarWindow === "weekly" ||
      s.usageSidebarWindow === "higher"
        ? s.usageSidebarWindow
        : undefined,
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
    gitPull: normalizeGitPull(s.gitPull, s.gitPullStrategy),
    gitPush: normalizeGitPush(s.gitPush),
    gitFetch: normalizeGitFetch(s.gitFetch),
    checkOrigin: s.checkOrigin,
    autoPull: s.autoPull === undefined ? undefined : normalizeAutoPullMode(s.autoPull),
    autoUpdateHosts: s.autoUpdateHosts,
    installUpdatesWhenIdle: s.installUpdatesWhenIdle || undefined,
    updateChannel: s.updateChannel === "beta" ? "beta" : undefined,
    crashReports: s.crashReports === false ? false : undefined,
    dailyPing: s.dailyPing === false ? false : undefined,
    keepFinishedAgents: s.keepFinishedAgents,
    autoArchiveAgentsAfter: isArchiveAfter(s.autoArchiveAgentsAfter) ? s.autoArchiveAgentsAfter : undefined,
    seenAgentsShown:
      typeof s.seenAgentsShown === "number"
        ? Math.min(SEEN_SHOWN_MAX, Math.max(SEEN_SHOWN_MIN, Math.round(s.seenAgentsShown)))
        : undefined,
    experimentalTTS: s.experimentalTTS,
    ttsEnabled: s.ttsEnabled,
    ttsEngine: s.ttsEngine || undefined,
    ttsOpenAiVoice: s.ttsOpenAiVoice || undefined,
    ttsVoice: s.ttsVoice || undefined,
    ttsSpeed: s.ttsSpeed,
    generateApproval: isGenerateApproval(s.generateApproval) ? s.generateApproval : undefined,
    generateDailyLimit:
      typeof s.generateDailyLimit === "number" && s.generateDailyLimit >= 0 ? s.generateDailyLimit : undefined,
    generateImageModel: s.generateImageModel || undefined,
    generateVoice: s.generateVoice || undefined,
    generateKeepOutOfGit: s.generateKeepOutOfGit === false ? false : undefined,
    videoNarrator: s.videoNarrator === "local" || s.videoNarrator === "openai" ? s.videoNarrator : undefined,
    videoLocalVoice: s.videoLocalVoice || undefined,
    videoCloudVoice: s.videoCloudVoice || undefined,
    preferredEditor: s.preferredEditor || undefined,
    searchFilterMode: s.searchFilterMode,
    duplicateExcludeUncommitted: s.duplicateExcludeUncommitted,
    duplicateReinstallDeps: s.duplicateReinstallDeps,
    duplicatePullLatest: s.duplicatePullLatest,
    duplicateRunMode:
      s.duplicateRunMode === "action" || s.duplicateRunMode === "command"
        ? s.duplicateRunMode
        : undefined,
    duplicateActionName: s.duplicateActionName || undefined,
    duplicateCommand: s.duplicateCommand || undefined,
    duplicateRunSectionOpen: s.duplicateRunSectionOpen,
    duplicateOptionsSectionOpen: s.duplicateOptionsSectionOpen,
    runInDuplicatesSideBySide: s.runInDuplicatesSideBySide,
    runInDuplicatesLayout: s.runInDuplicatesLayout === "rows" ? "rows" : undefined,
    composerOpen: s.composerOpen,
    autoCloseComposerOnSend:
      s.autoCloseComposerOnSend ?? defaults.autoCloseComposerOnSend,
    pickAgentOnNewTab: s.pickAgentOnNewTab,
    appTipsDismissed: s.appTipsDismissed,
    weeklyRecap: s.weeklyRecap,
    weeklyRecapHidden: s.weeklyRecapHidden || undefined,
    weeklyRecapToasted: s.weeklyRecapToasted || undefined,
    weeklyRecapTheme: normalizeRecapTheme(s.weeklyRecapTheme),
    weeklyRecapLeftOut: normalizeRecapRows(s.weeklyRecapLeftOut),
    githubStarSince: s.githubStarSince || undefined,
    githubStarAsked: s.githubStarAsked || undefined,
    githubStarred: s.githubStarred || undefined,
    codexStatusLineCustomItems: Array.isArray(s.codexStatusLineCustomItems)
      ? s.codexStatusLineCustomItems.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : undefined,
    hotkeys: normalizeHotkeys(s.hotkeys),
    quickTerminal: normalizeQuickTerminal(s.quickTerminal),
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
  // each other on independent fields. Raw disk values are spread first so
  // backend-only keys (e.g. windowX/windowY from mainwindow.rs) survive the
  // full-file rewrite — normalize() only carries keys this type knows about.
  update: async (partial) => {
    const cur = get();
    const dirty = (Object.keys(partial) as (keyof Settings)[]).some(
      (k) => cur[k] !== partial[k],
    );
    if (!dirty) return;
    const fresh = await LoadSettings();
    const merged: Settings = {
      ...fresh,
      ...defaults,
      ...normalize(fresh),
      ...partial,
    };
    await SaveSettings(merged);
    set(merged);
  },
}));

// A settings file's contents (or the part of one a connected machine shares) as
// the app reads them, defaults filled in.
export function settingsFromFile(raw: unknown): Settings {
  return normalize((raw ?? {}) as main.Settings);
}

function snapshot(): Settings {
  const { hydrate: _h, update: _u, ...values } = useSettingsStore.getState();
  return values;
}

// Snapshot accessors for callers outside React render paths (audio
// helpers, monaco link providers, event handlers). React components
// should subscribe with useSettingsStore directly.
// The imported theme's colors follow the setting before anything redraws.
setImportedTheme(useSettingsStore.getState().terminalImportedTheme);
useSettingsStore.subscribe((s) => setImportedTheme(s.terminalImportedTheme));

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
