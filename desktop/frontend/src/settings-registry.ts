import type { SettingsTab, View } from "./store/app";
import { HOTKEYS } from "./hotkeys";

export type SettingsFlag = "experimentalTTS";

export type SettingsRowEntry = {
  kind: "row";
  tab: SettingsTab;
  id: string;
  label: string;
  description: string;
  keywords?: string[];
};

export type SettingsViewEntry = {
  kind: "view";
  view: View;
  id: string;
  label: string;
  description: string;
  keywords?: string[];
};

export type SettingsSearchEntry = SettingsRowEntry | SettingsViewEntry;

export type SettingsNavItem =
  | { kind: "tab"; tab: SettingsTab; label: string; flag?: SettingsFlag }
  | { kind: "view"; view: View; label: string };

export interface SettingsNavGroup {
  title: string;
  items: SettingsNavItem[];
}

export const TAB_TITLES: Record<SettingsTab, string> = {
  general: "General",
  notifications: "Notifications",
  terminal: "Terminal",
  shortcuts: "Shortcuts",
  tts: "Text to Speech",
  ai: "AI & Integrations",
  templates: "Templates",
  backup: "Backup & Transfer",
  mobile: "Mobile devices",
  "connect-macs": "Connect Macs",
};

export const NAV_GROUPS: SettingsNavGroup[] = [
  {
    title: "App",
    items: [
      { kind: "tab", tab: "general", label: "General" },
      { kind: "tab", tab: "notifications", label: "Notifications" },
      { kind: "tab", tab: "terminal", label: "Terminal" },
      { kind: "tab", tab: "shortcuts", label: "Shortcuts" },
    ],
  },
  {
    title: "AI",
    items: [
      { kind: "tab", tab: "ai", label: "AI & Integrations" },
      { kind: "tab", tab: "tts", label: "Text to Speech", flag: "experimentalTTS" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { kind: "tab", tab: "templates", label: "Templates" },
      { kind: "tab", tab: "backup", label: "Backup & Transfer" },
      { kind: "view", view: "global-config", label: "Global Config" },
    ],
  },
  {
    title: "Devices",
    items: [
      { kind: "tab", tab: "mobile", label: "Mobile devices" },
      { kind: "tab", tab: "connect-macs", label: "Connect Macs" },
    ],
  },
];

export function visibleNavGroups(flags: {
  experimentalTTS: boolean;
}): SettingsNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        item.kind !== "tab" || !item.flag || flags[item.flag],
    ),
  })).filter((group) => group.items.length > 0);
}

// Static rows are the single source of truth for their label/description:
// Settings.tsx spreads them into the rendered row via `rowProps`, so the search
// index and the UI can never drift. Dynamic-description rows (updates, hooks,
// Kokoro, TTS enable) keep a stable searchable description here while rendering
// their live status separately.
export const ROWS = {
  "general.theme": {
    kind: "row",
    tab: "general",
    id: "general.theme",
    label: "Theme",
    description: "Choose your preferred look",
    keywords: ["appearance", "dark", "light", "mode", "color"],
  },
  "general.doubleClick": {
    kind: "row",
    tab: "general",
    id: "general.doubleClick",
    label: "Double-click to start/stop",
    description: "Double-click a project in sidebar to toggle it",
    keywords: ["toggle", "run"],
  },
  "general.defaultDir": {
    kind: "row",
    tab: "general",
    id: "general.defaultDir",
    label: "Default project directory",
    description: "Add project, clone destination, and global terminals open here",
    keywords: ["folder", "location", "path"],
  },
  "general.version": {
    kind: "row",
    tab: "general",
    id: "general.version",
    label: "Version",
    description: "lpm desktop",
    keywords: ["build", "about"],
  },
  "general.updates": {
    kind: "row",
    tab: "general",
    id: "general.updates",
    label: "Updates",
    description: "Check for new versions",
    keywords: ["upgrade", "update", "new version"],
  },
  "general.agentTools": {
    kind: "row",
    tab: "general",
    id: "general.agentTools",
    label: "Agent tools",
    description:
      "Teach AI coding agents to author configs and drive lpm from the command line.",
    keywords: ["skill", "cli", "claude code", "codex", "gemini"],
  },
  "general.feedback": {
    kind: "row",
    tab: "general",
    id: "general.feedback",
    label: "Send feedback",
    description: "Report a bug or share ideas",
    keywords: ["bug", "idea", "contact", "support"],
  },
  "notifications.sound": {
    kind: "row",
    tab: "notifications",
    id: "notifications.sound",
    label: "Sound notifications",
    description: "Play a sound when agents finish or need approval",
    keywords: ["audio", "alert", "chime"],
  },
  "notifications.hooks": {
    kind: "row",
    tab: "notifications",
    id: "notifications.hooks",
    label: "Claude Code Hooks",
    description: "Display Claude Code running progress in sidebar",
    keywords: ["progress", "sidebar", "claude"],
  },
  "terminal.fontSize": {
    kind: "row",
    tab: "terminal",
    id: "terminal.fontSize",
    label: "Font size",
    description: "Used by the built-in terminal",
    keywords: ["zoom", "text size"],
  },
  "terminal.theme": {
    kind: "row",
    tab: "terminal",
    id: "terminal.theme",
    label: "Theme",
    description: "Color scheme for the built-in terminal",
    keywords: ["color", "appearance"],
  },
  "terminal.openInDefaultApp": {
    kind: "row",
    tab: "terminal",
    id: "terminal.openInDefaultApp",
    label: "Open files in default app",
    description:
      "Click a file path in the terminal to open it in the OS default app instead of the in-app preview",
    keywords: ["file", "preview", "editor"],
  },
  "terminal.input": {
    kind: "row",
    tab: "terminal",
    id: "terminal.input",
    label: "Terminal input",
    description: "Show the message input below each terminal. Toggle anytime with ⌘I",
    keywords: ["composer", "message", "prompt"],
  },
  "terminal.autoCloseComposer": {
    kind: "row",
    tab: "terminal",
    id: "terminal.autoCloseComposer",
    label: "Auto close composer on send",
    description:
      "Sending a prepared input clears it and closes its tab when more than one is open, instead of keeping the tab",
    keywords: ["composer", "send"],
  },
  "terminal.appTips": {
    kind: "row",
    tab: "terminal",
    id: "terminal.appTips",
    label: "App tips",
    description: "Show a rotating tip with shortcuts in the terminal footer",
    keywords: ["hints", "tips"],
  },
  "tts.enable": {
    kind: "row",
    tab: "tts",
    id: "tts.enable",
    label: "Enable",
    description: "Read terminal text aloud using Kokoro",
    keywords: ["speech", "voice", "read aloud", "kokoro"],
  },
  "tts.voice": {
    kind: "row",
    tab: "tts",
    id: "tts.voice",
    label: "Voice",
    description: "Kokoro voice",
    keywords: ["speech", "kokoro"],
  },
  "tts.speed": {
    kind: "row",
    tab: "tts",
    id: "tts.speed",
    label: "Speed",
    description: "Playback speed",
    keywords: ["speech", "rate"],
  },
  "tts.kokoro": {
    kind: "row",
    tab: "tts",
    id: "tts.kokoro",
    label: "Kokoro Engine",
    description: "Kokoro TTS engine",
    keywords: ["speech", "install", "engine"],
  },
  "ai.commitInstructions": {
    kind: "row",
    tab: "ai",
    id: "ai.commitInstructions",
    label: "Commit Instructions",
    description: "Custom instructions for AI commit messages",
    keywords: ["git", "message"],
  },
  "ai.prInstructions": {
    kind: "row",
    tab: "ai",
    id: "ai.prInstructions",
    label: "PR Instructions",
    description: "Custom instructions for AI-generated PR titles and descriptions",
    keywords: ["pull request", "git"],
  },
  "ai.branchInstructions": {
    kind: "row",
    tab: "ai",
    id: "ai.branchInstructions",
    label: "Branch Name Instructions",
    description: "Custom instructions for AI-generated branch names",
    keywords: ["git", "branch"],
  },
  "ai.voiceToText": {
    kind: "row",
    tab: "ai",
    id: "ai.voiceToText",
    label: "VoiceToText",
    description:
      "Free offline dictation — Claude Code, Codex, Cursor, Slack, or any text field",
    keywords: ["dictation", "speech", "voice"],
  },
  "ai.accounts": {
    kind: "row",
    tab: "ai",
    id: "ai.accounts",
    label: "Claude accounts",
    description: "Keep each project signed in to the right Claude account.",
    keywords: ["login", "sign in", "account", "claude"],
  },
  "templates.list": {
    kind: "row",
    tab: "templates",
    id: "templates.list",
    label: "Templates",
    description:
      "Reusable sets of services, actions, and profiles you can apply to multiple projects",
    keywords: ["reusable", "extends", "profile"],
  },
  "backup.export": {
    kind: "row",
    tab: "backup",
    id: "backup.export",
    label: "Export config",
    description: "Save a portable archive of your projects and settings",
    keywords: ["backup", "archive", "transfer"],
  },
  "backup.import": {
    kind: "row",
    tab: "backup",
    id: "backup.import",
    label: "Import config",
    description: "Restore from an archive (current config backed up first)",
    keywords: ["backup", "archive", "restore", "transfer"],
  },
  "backup.vaultExport": {
    kind: "row",
    tab: "backup",
    id: "backup.vaultExport",
    label: "Back up your key",
    description: "Saves a password-protected file. Keep it somewhere safe.",
    keywords: ["encryption", "key", "vault"],
  },
  "backup.vaultImport": {
    kind: "row",
    tab: "backup",
    id: "backup.vaultImport",
    label: "Restore your key",
    description: "Load a saved key file to unlock notes on this Mac.",
    keywords: ["encryption", "key", "vault"],
  },
  "mobile.devices": {
    kind: "row",
    tab: "mobile",
    id: "mobile.devices",
    label: "Mobile devices",
    description: "Pair your iPhone to mirror terminals and control projects",
    keywords: ["iphone", "phone", "ios", "remote"],
  },
  "connect-macs.peers": {
    kind: "row",
    tab: "connect-macs",
    id: "connect-macs.peers",
    label: "Connect Macs",
    description: "Control another Mac's projects from this one",
    keywords: ["peer", "remote", "mac"],
  },
} satisfies Record<string, SettingsRowEntry>;

export type SettingsRowId = keyof typeof ROWS;

const VIEW_ENTRIES: SettingsViewEntry[] = [
  {
    kind: "view",
    view: "global-config",
    id: "global-config",
    label: "Global Config",
    description:
      "Actions and terminals defined in every project. Stored in the global config file.",
    keywords: ["yaml", "global", "every project"],
  },
];

// Dynamically-generated rows are indexed straight from their source arrays so
// adding a shortcut or sound event automatically makes it searchable.
export const SOUND_EVENTS: {
  event: "done" | "waiting" | "error";
  label: string;
  description: string;
}[] = [
  { event: "done", label: "Finished sound", description: "Plays when an agent finishes" },
  {
    event: "waiting",
    label: "Needs approval sound",
    description: "Plays when an agent is waiting for you",
  },
  {
    event: "error",
    label: "Error sound",
    description: "Plays when an agent stops with an error",
  },
];

function soundEntries(): SettingsRowEntry[] {
  return SOUND_EVENTS.map((s) => ({
    kind: "row",
    tab: "notifications",
    id: `sound.${s.event}`,
    label: s.label,
    description: s.description,
    keywords: ["sound", "audio", "notification"],
  }));
}

function shortcutEntries(): SettingsRowEntry[] {
  return HOTKEYS.map((def) => ({
    kind: "row",
    tab: "shortcuts",
    id: `shortcut.${def.id}`,
    label: def.label,
    description: def.description,
    keywords: ["keyboard", "hotkey", "shortcut"],
  }));
}

export function rowProps(
  id: SettingsRowId,
  overrides?: { description?: string },
): { id: string; label: string; description: string } {
  const row = ROWS[id];
  return {
    id: row.id,
    label: row.label,
    description: overrides?.description ?? row.description,
  };
}

export function buildSearchEntries(ctx: {
  experimentalTTS: boolean;
}): SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = [
    ...Object.values(ROWS),
    ...soundEntries(),
    ...shortcutEntries(),
    ...VIEW_ENTRIES,
  ];
  return entries.filter(
    (e) => e.kind !== "row" || e.tab !== "tts" || ctx.experimentalTTS,
  );
}

// Case-insensitive substring match over label, description, keywords, and (for
// row entries) the tab title. Label matches rank above the rest; ties keep the
// registry's declaration order.
export function matchSettings(
  entries: SettingsSearchEntry[],
  query: string,
): SettingsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { entry: SettingsSearchEntry; rank: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const inLabel = entry.label.toLowerCase().includes(q);
    const rest = [
      entry.description,
      ...(entry.keywords ?? []),
      entry.kind === "row" ? TAB_TITLES[entry.tab] : "",
    ]
      .join(" ")
      .toLowerCase();
    const inRest = rest.includes(q);
    if (!inLabel && !inRest) return;
    scored.push({ entry, rank: inLabel ? 0 : 1, index });
  });
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return scored.map((s) => s.entry);
}

export function captionFor(entry: SettingsSearchEntry): string {
  return entry.kind === "row" ? TAB_TITLES[entry.tab] : "Opens editor";
}
