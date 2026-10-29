import type { SettingsTab, View } from "./store/app";
import { builtinShortcutGroups } from "./builtinShortcuts";
import { HOTKEYS } from "./hotkeys";
import { chordLabel } from "./keys";
import { MACHINE } from "./machineWords";
import { isMac } from "./platform";
import { removeAppDescription } from "./removeAppCopy";
import {
  LOCAL_MACHINE,
  reaches,
  type SettingsMachine,
  type SettingsReach,
} from "./settingsMachine";

export type SettingsFlag = "experimentalTTS";

export type SettingsRowEntry = {
  kind: "row";
  tab: SettingsTab;
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  // Backed by something only macOS has; the row and its search entry are
  // hidden elsewhere.
  macOnly?: boolean;
  // Which connected machines it can be changed on; unset, only this one.
  reach?: SettingsReach;
};

export type SettingsViewEntry = {
  kind: "view";
  view: View;
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  // Which connected machines it opens for; unset, only this one.
  reach?: SettingsReach;
};

export type SettingsSearchEntry = SettingsRowEntry | SettingsViewEntry;

export type SettingsNavItem =
  | { kind: "tab"; tab: SettingsTab; label: string; flag?: SettingsFlag }
  | { kind: "view"; view: View; label: string; reach?: SettingsReach };

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
  agents: "Agents",
  accounts: "Accounts & usage",
  git: "Git",
  templates: "Templates",
  backup: "Backup & transfer",
  mobile: "Mobile devices",
  connections: "Connections",
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
      { kind: "tab", tab: "agents", label: "Agents" },
      { kind: "tab", tab: "accounts", label: "Accounts & usage" },
      { kind: "tab", tab: "tts", label: "Text to Speech", flag: "experimentalTTS" },
    ],
  },
  {
    title: "Projects & data",
    items: [
      { kind: "tab", tab: "git", label: "Git" },
      { kind: "tab", tab: "templates", label: "Templates" },
      { kind: "tab", tab: "backup", label: "Backup & transfer" },
      { kind: "view", view: "global-config", label: "Global config", reach: "any" },
    ],
  },
  {
    title: "Devices",
    items: [
      { kind: "tab", tab: "mobile", label: "Mobile devices" },
      { kind: "tab", tab: "connections", label: "Connections" },
    ],
  },
];

// A connected machine's Settings shows only the pages that have something to
// change there.
export function visibleNavGroups(
  flags: { experimentalTTS: boolean },
  machine: SettingsMachine = LOCAL_MACHINE,
): SettingsNavGroup[] {
  const reachable = (tab: SettingsTab) =>
    rowEntries().some((row) => row.tab === tab && reaches(machine, row.reach));
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.kind === "tab"
        ? (!item.flag || flags[item.flag]) && reachable(item.tab)
        : reaches(machine, item.reach),
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
    reach: "attended",
    label: "Theme",
    description: "Choose your preferred look",
    keywords: ["appearance", "dark", "light", "mode", "color"],
  },
  "general.doubleClick": {
    kind: "row",
    tab: "general",
    id: "general.doubleClick",
    reach: "attended",
    label: "Double-click to start/stop",
    description: "Double-click a project in sidebar to toggle it",
    keywords: ["toggle", "run"],
  },
  "general.defaultDir": {
    kind: "row",
    tab: "general",
    id: "general.defaultDir",
    reach: "any",
    label: "Default project directory",
    description: "Add project, clone destination, and global terminals open here",
    keywords: ["folder", "location", "path"],
  },
  "general.version": {
    kind: "row",
    tab: "general",
    id: "general.version",
    reach: "any",
    label: "Version",
    description: "lpm desktop",
    keywords: ["build", "about"],
  },
  "general.updates": {
    kind: "row",
    tab: "general",
    id: "general.updates",
    label: "Updates",
    description: "Check for and install new versions",
    keywords: ["upgrade", "update", "new version", "what's new", "release notes", "when agents finish"],
  },
  "general.updateChannel": {
    kind: "row",
    tab: "general",
    id: "general.updateChannel",
    reach: "any",
    label: "Update channel",
    description: "Beta gets new versions first. They may be less stable",
    keywords: ["beta", "stable", "pre-release", "early access", "roll back", "rollback", "downgrade"],
  },
  "general.idleUpdates": {
    kind: "row",
    tab: "general",
    id: "general.idleUpdates",
    label: "Install automatically",
    description: "When you've been away 10 minutes and no agent is working",
    keywords: ["install updates when idle", "automatic", "auto update", "upgrade", "away", "background", "unattended"],
  },
  "general.servicesBuild": {
    kind: "row",
    tab: "general",
    id: "general.servicesBuild",
    label: "Restart services",
    description: "Services still running on the version from before an update",
    keywords: ["services", "old version", "outdated", "daemon", "update"],
  },
  "general.removeApp": {
    kind: "row",
    tab: "general",
    id: "general.removeApp",
    label: "Remove app",
    description: removeAppDescription(),
    keywords: ["uninstall", "delete", "trash"],
  },
  "notifications.channels": {
    kind: "row",
    tab: "notifications",
    id: "notifications.channels",
    reach: "attended",
    label: "Where notifications reach you",
    description: "For each kind of news: a toast in the app, a sound, or a system banner",
    keywords: ["sound", "banner", "toast", "alert", "chime", "system", "desktop", "away", "agent", "automation"],
  },
  "notifications.holdWhileTyping": {
    kind: "row",
    tab: "notifications",
    id: "notifications.holdWhileTyping",
    reach: "attended",
    label: "Hold toasts while I type",
    description: "They wait until the composer goes quiet, then show",
    keywords: ["toast", "composer", "typing", "quiet", "focus", "interrupt"],
  },
  "notifications.weeklyRecap": {
    kind: "row",
    tab: "notifications",
    id: "notifications.weeklyRecap",
    label: "Weekly recap",
    description: "On Mondays, last week's agent hours, prompts and streak at the top of Stats, with one toast",
    keywords: ["recap", "week", "weekly", "summary", "share", "stats", "monday", "streak"],
  },
  "notifications.telegram": {
    kind: "row",
    tab: "notifications",
    id: "notifications.telegram",
    reach: "any",
    label: "Telegram",
    description: "Send automation results to a Telegram chat and answer their questions there",
    keywords: ["telegram", "bot", "chat", "automation", "job", "send to", "message"],
  },
  "notifications.sendToRequest": {
    kind: "row",
    tab: "notifications",
    id: "notifications.sendToRequest",
    reach: "any",
    label: "Another place to send results",
    description: "Slack, Discord, email… ask for the one you'd use",
    keywords: ["slack", "discord", "email", "webhook", "request", "github", "send to", "automation"],
  },
  "terminal.fontFamily": {
    kind: "row",
    tab: "terminal",
    id: "terminal.fontFamily",
    reach: "attended",
    label: "Font",
    description: "Font family for the built-in terminal",
    keywords: ["font", "typeface", "monospace", "font family"],
  },
  "terminal.fontSize": {
    kind: "row",
    tab: "terminal",
    id: "terminal.fontSize",
    reach: "attended",
    label: "Font size",
    description: "Used by the built-in terminal",
    keywords: ["zoom", "text size"],
  },
  "terminal.lineHeight": {
    kind: "row",
    tab: "terminal",
    id: "terminal.lineHeight",
    reach: "attended",
    label: "Line height",
    description: "Vertical spacing between terminal lines",
    keywords: ["spacing", "leading"],
  },
  "terminal.theme": {
    kind: "row",
    tab: "terminal",
    id: "terminal.theme",
    reach: "attended",
    label: "Theme",
    description: "Color scheme for the built-in terminal",
    keywords: ["color", "appearance"],
  },
  "terminal.openInDefaultApp": {
    kind: "row",
    tab: "terminal",
    id: "terminal.openInDefaultApp",
    reach: "attended",
    label: "Open files in default app",
    description:
      "Click a file path in the terminal to open it in the OS default app instead of the in-app preview",
    keywords: ["file", "preview", "editor"],
  },
  "terminal.filesTreeSide": {
    kind: "row",
    tab: "terminal",
    id: "terminal.filesTreeSide",
    reach: "attended",
    label: "Files tree position",
    description: "Which side of the Files tab holds the folder tree",
    keywords: ["files", "tree", "sidebar", "left", "right", "browser"],
  },
  "terminal.appTips": {
    kind: "row",
    tab: "terminal",
    id: "terminal.appTips",
    reach: "attended",
    label: "App tips",
    description: "Show a rotating tip with shortcuts in the terminal footer",
    keywords: ["hints", "tips"],
  },
  "tts.enable": {
    kind: "row",
    tab: "tts",
    id: "tts.enable",
    reach: "attended",
    label: "Enable",
    description: "Read terminal text aloud using Kokoro",
    keywords: ["speech", "voice", "read aloud", "kokoro"],
  },
  "tts.engine": {
    kind: "row",
    tab: "tts",
    id: "tts.engine",
    reach: "attended",
    label: "Engine",
    description: "Which voice synthesizes the speech",
    keywords: ["speech", "kokoro", "openai", "engine", "voice"],
  },
  "tts.openaiKey": {
    kind: "row",
    tab: "tts",
    id: "tts.openaiKey",
    reach: "attended",
    label: "OpenAI API Key",
    description: isMac
      ? "Stored in the macOS Keychain, never in settings.json"
      : "Stored on this computer, never in settings.json",
    keywords: ["speech", "openai", "api key", "keychain", "secret"],
  },
  "tts.openaiVoice": {
    kind: "row",
    tab: "tts",
    id: "tts.openaiVoice",
    reach: "attended",
    label: "OpenAI Voice",
    description: "OpenAI voice",
    keywords: ["speech", "openai", "voice"],
  },
  "tts.voice": {
    kind: "row",
    tab: "tts",
    id: "tts.voice",
    reach: "attended",
    label: "Voice",
    description: "Kokoro voice",
    keywords: ["speech", "kokoro"],
  },
  "tts.speed": {
    kind: "row",
    tab: "tts",
    id: "tts.speed",
    reach: "attended",
    label: "Speed",
    description: "Playback speed",
    keywords: ["speech", "rate"],
  },
  "tts.kokoro": {
    kind: "row",
    tab: "tts",
    id: "tts.kokoro",
    reach: "attended",
    label: "Kokoro Engine",
    description: "Kokoro TTS engine",
    keywords: ["speech", "install", "engine"],
  },
  "terminal.pickAgentOnNewTab": {
    kind: "row",
    tab: "agents",
    id: "terminal.pickAgentOnNewTab",
    reach: "attended",
    label: "Pick an agent for new tabs",
    description: `+ and ${chordLabel({ key: "t", meta: true })} ask for an agent, model, level and first prompt instead of opening a plain terminal`,
    keywords: ["pick agent and model on +", "new tab", "new terminal", "agent", "model", "effort", "level", "claude", "codex", "plus"],
  },
  "terminal.input": {
    kind: "row",
    tab: "agents",
    id: "terminal.input",
    reach: "attended",
    label: "Show the message input",
    description: `A box under each terminal for writing to agents. ${chordLabel({ key: "i", meta: true })} shows or hides it`,
    keywords: ["terminal input", "composer", "message", "prompt"],
  },
  "terminal.autoCloseComposer": {
    kind: "row",
    tab: "agents",
    id: "terminal.autoCloseComposer",
    reach: "attended",
    label: "Close a draft once it's sent",
    description: "With several drafts open, sending one closes its tab",
    keywords: ["auto close composer on send", "composer", "send", "draft"],
  },
  "agents.quickActions": {
    kind: "row",
    tab: "agents",
    id: "agents.quickActions",
    label: "Quick actions",
    description: "Saved instructions in the input's Actions menu. lpm Link shows them too",
    keywords: ["composer actions", "actions", "prompt", "instruction", "snippet", "template"],
  },
  "ai.voiceToText": {
    kind: "row",
    tab: "agents",
    id: "ai.voiceToText",
    label: "Dictation",
    description: "Speak your prompts with VoiceToText, a separate Mac app",
    keywords: ["voicetotext", "dictation", "speech", "voice"],
    macOnly: true,
  },
  "general.keepFinishedAgents": {
    kind: "row",
    tab: "agents",
    id: "general.keepFinishedAgents",
    reach: "any",
    label: "Keep finished agents until archived",
    description: "Opening a finished agent marks it seen instead of removing its row",
    keywords: ["archive", "sidebar", "agent", "finished", "seen", "done", "read", "dismiss"],
  },
  "general.autoArchiveAgents": {
    kind: "row",
    tab: "agents",
    id: "general.autoArchiveAgents",
    reach: "any",
    label: "Archive seen agents after",
    description: "Counted from when you last opened the agent",
    keywords: ["archive seen agents automatically", "archive", "sidebar", "agent", "seen", "expire", "clean up", "automatic", "never", "minutes", "hours", "days"],
  },
  "general.seenAgentsShown": {
    kind: "row",
    tab: "agents",
    id: "general.seenAgentsShown",
    reach: "any",
    label: "Seen agents per project",
    description: "Any more fold into a “more seen” line",
    keywords: ["archive", "sidebar", "agent", "seen", "fold", "limit"],
  },
  "ai.statusLine": {
    kind: "row",
    tab: "agents",
    id: "ai.statusLine",
    reach: "any",
    label: "Claude Code status line",
    description: "What shows under every Claude Code prompt",
    keywords: ["statusline", "status line", "claude", "template", "meter", "custom", "segments", "separator", "ai", "generate", "preview"],
  },
  "ai.claudeHooks": {
    kind: "row",
    tab: "agents",
    id: "ai.claudeHooks",
    reach: "any",
    label: "Claude Code progress",
    description: "Hooks that show what each Claude agent is doing in the sidebar. Check finds and fixes problems",
    keywords: ["claude code hooks", "hooks", "progress", "sidebar", "claude", "repair"],
  },
  "ai.codexStatusLine": {
    kind: "row",
    tab: "agents",
    id: "ai.codexStatusLine",
    reach: "any",
    label: "Codex status line",
    description: "What shows at the bottom of Codex",
    keywords: ["codex cli status line", "statusline", "status line", "codex", "footer", "fields", "items", "preview"],
  },
  "general.agentTools": {
    kind: "row",
    tab: "agents",
    id: "general.agentTools",
    label: "lpm skills and CLI",
    description: "Teach Claude Code, Codex, Gemini and OpenCode to run lpm for you. Shows the installed versions",
    keywords: ["agent tools", "skill", "skills", "cli", "command line", "claude code", "codex", "gemini", "opencode"],
  },
  "ai.accounts": {
    kind: "row",
    tab: "accounts",
    id: "ai.accounts",
    reach: "any",
    label: "Claude accounts",
    description: "Every Claude login lpm knows here. Sign in, rename or remove each one",
    keywords: ["login", "sign in", "account", "accounts", "multiple", "switch", "claude", "ai & integrations"],
  },
  "ai.accountSwitching": {
    kind: "row",
    tab: "accounts",
    id: "ai.accountSwitching",
    reach: "any",
    label: "Switch accounts automatically",
    description: "New Claude sessions move to the next account as one nears its 5-hour or weekly limit",
    keywords: ["switch", "rotate", "rotation", "turn order", "limit", "usage", "pool", "accounts", "claude", "5-hour", "weekly"],
  },
  "accounts.readClaudeUsage": {
    kind: "row",
    tab: "accounts",
    id: "accounts.readClaudeUsage",
    reach: "any",
    label: "Read Claude usage",
    description: "Adds lpm to Claude Code's status line so it can see your 5-hour and weekly limits. Switching accounts needs it",
    keywords: ["usage meters", "claude usage meters", "limits", "rate limit", "quota", "5-hour", "weekly", "status line"],
  },
  "accounts.sidebarUsage": {
    kind: "row",
    tab: "accounts",
    id: "accounts.sidebarUsage",
    reach: "attended",
    label: "Show usage in the sidebar",
    description: "A small meter just above the sidebar footer",
    keywords: ["usage", "meter", "sidebar", "limits", "quota"],
  },
  "accounts.sidebarUsageTools": {
    kind: "row",
    tab: "accounts",
    id: "accounts.sidebarUsageTools",
    reach: "attended",
    label: "Tools in the meter",
    description: "Claude, Codex, or both",
    keywords: ["usage", "meter", "sidebar", "claude", "codex"],
  },
  "accounts.sidebarUsageWindow": {
    kind: "row",
    tab: "accounts",
    id: "accounts.sidebarUsageWindow",
    reach: "attended",
    label: "Limit in the meter",
    description: "5-hour, weekly, or whichever is higher",
    keywords: ["usage", "meter", "sidebar", "5-hour", "weekly", "window"],
  },
  usage: {
    kind: "row",
    tab: "accounts",
    id: "usage",
    label: "Open usage",
    description: "See how much of each Claude and Codex plan you've used",
    keywords: ["usage limits", "rate limit", "quota", "claude", "codex", "plan", "meter"],
  },
  "general.checkOrigin": {
    kind: "row",
    tab: "git",
    id: "general.checkOrigin",
    reach: "any",
    label: "Check for new commits",
    description: "Fetches in the background and marks projects whose branch on origin is ahead",
    keywords: ["git", "fetch", "pull", "behind", "origin", "remote", "sync"],
  },
  "general.autoPull": {
    kind: "row",
    tab: "git",
    id: "general.autoPull",
    reach: "any",
    label: "Auto pull",
    description: "Fast-forward a clean branch on its own: off, chosen projects, or all. A project's Git menu can set its own",
    keywords: ["git", "pull", "automatic", "fast-forward", "origin", "update", "sync", "duplicates"],
  },
  "git.pullStrategy": {
    kind: "row",
    tab: "git",
    id: "git.pullStrategy",
    reach: "any",
    label: "When pulling",
    description: "Fast-forward or merge, fast-forward only, or rebase. The Pull menu uses this too",
    keywords: ["pull", "rebase", "merge", "ff-only", "fast-forward", "strategy"],
  },
  "git.pullAutostash": {
    kind: "row",
    tab: "git",
    id: "git.pullAutostash",
    reach: "any",
    label: "Stash my changes before pulling",
    description: "Pull with uncommitted changes, then put them back",
    keywords: ["autostash", "stash", "pull", "uncommitted"],
  },
  "git.pushMode": {
    kind: "row",
    tab: "git",
    id: "git.pushMode",
    reach: "any",
    label: "When pushing",
    description: "Normal, or force with lease. The Push menu uses this too",
    keywords: ["push", "force", "force-with-lease", "mode"],
  },
  "git.pushTags": {
    kind: "row",
    tab: "git",
    id: "git.pushTags",
    reach: "any",
    label: "Push tags too",
    description: "Send local tags with each push",
    keywords: ["push", "tags", "follow-tags"],
  },
  "git.skipHooks": {
    kind: "row",
    tab: "git",
    id: "git.skipHooks",
    reach: "any",
    label: "Skip Git hooks",
    description: "When pushing, when pulling, or both",
    keywords: ["no-verify", "hooks", "pre-push", "husky", "push", "pull"],
  },
  "git.fetchOptions": {
    kind: "row",
    tab: "git",
    id: "git.fetchOptions",
    reach: "any",
    label: "When fetching",
    description: "Every remote, remove deleted branches, remove deleted tags, get tags",
    keywords: ["fetch", "prune", "prune tags", "all remotes", "tags"],
  },
  "git.aiModel": {
    kind: "row",
    tab: "git",
    id: "git.aiModel",
    reach: "any",
    label: "AI model",
    description: "The agent and model lpm writes commit messages, PR text and branch names with. It also improves your prompts",
    keywords: ["model", "agent", "effort", "lpm's ai", "claude", "codex", "generate", "commit message"],
  },
  "git.autoCommitMessage": {
    kind: "row",
    tab: "git",
    id: "git.autoCommitMessage",
    reach: "attended",
    label: "Write commit messages on open",
    description: "The Commit window opens with a message ready",
    keywords: ["auto-generate", "commit", "message", "ai"],
  },
  "git.autoPrDescription": {
    kind: "row",
    tab: "git",
    id: "git.autoPrDescription",
    reach: "attended",
    label: "Write PR descriptions on open",
    description: "The pull request window opens with a title and description ready",
    keywords: ["auto-generate", "pull request", "pr", "description", "ai"],
  },
  "ai.commitInstructions": {
    kind: "row",
    tab: "git",
    id: "ai.commitInstructions",
    reach: "any",
    label: "Commit message instructions",
    description: "What AI follows when it writes a commit message. Projects can set their own",
    keywords: ["commit instructions", "git", "message", "prompt", "ai & integrations"],
  },
  "ai.prInstructions": {
    kind: "row",
    tab: "git",
    id: "ai.prInstructions",
    reach: "any",
    label: "Pull request instructions",
    description: "What AI follows when it writes a PR title and description. Projects can set their own",
    keywords: ["pr instructions", "pull request", "git", "prompt"],
  },
  "ai.branchInstructions": {
    kind: "row",
    tab: "git",
    id: "ai.branchInstructions",
    reach: "any",
    label: "Branch name instructions",
    description: "What AI follows when it names a new branch. Projects can set their own",
    keywords: ["git", "branch", "prompt"],
  },
  "templates.list": {
    kind: "row",
    tab: "templates",
    id: "templates.list",
    reach: "any",
    label: "Templates",
    description:
      "Reusable sets of actions and terminals you can apply to multiple projects",
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
    description: `Load a saved key file to unlock notes on ${MACHINE.thisMachine}.`,
    keywords: ["encryption", "key", "vault"],
  },
  "mobile.devices": {
    kind: "row",
    tab: "mobile",
    id: "mobile.devices",
    reach: "any",
    label: "Mobile devices",
    description: "Pair your iPhone to mirror terminals and control projects",
    keywords: ["iphone", "phone", "ios", "remote"],
  },
  "mobile.tailscale": {
    kind: "row",
    tab: "mobile",
    id: "mobile.tailscale",
    reach: "any",
    label: "Built-in Tailscale",
    description: `Reach ${MACHINE.thisMachine} from your phone on any network, without the Tailscale app`,
    keywords: ["tailscale", "tailnet", "vpn", "cellular", "away", "anywhere", "remote"],
  },
  "mobile.keepAwake": {
    kind: "row",
    tab: "mobile",
    id: "mobile.keepAwake",
    reach: "any",
    label: `Keep ${MACHINE.thisMachine} awake`,
    description: "While remote control or Allow control is on and it's plugged in",
    keywords: ["sleep", "awake", "power", "battery", "port", "caffeinate", "security code", "identity"],
  },
  "connections.keepAwake": {
    kind: "row",
    tab: "connections",
    id: "connections.keepAwake",
    label: `Keep ${MACHINE.thisMachine} awake`,
    description: `While Allow control is on and it's plugged in, so your other ${MACHINE.plural} can reach it`,
    keywords: ["sleep", "awake", "power", "battery", "caffeinate", "allow control", "peer", "host"],
  },
  "connections.peers": {
    kind: "row",
    tab: "connections",
    id: "connections.peers",
    label: "Connections",
    description: "Control another machine's projects from this one",
    keywords: ["peer", "remote", "mac", "linux", "server", "host", "nearby", "discover"],
  },
  "connections.tailscale": {
    kind: "row",
    tab: "connections",
    id: "connections.tailscale",
    label: "Built-in Tailscale",
    description: `Reach your other ${MACHINE.plural} from any network, without the Tailscale app`,
    keywords: ["tailscale", "tailnet", "vpn", "away", "anywhere", "remote", "peer", "mac", "linux"],
  },
  "connections.port": {
    kind: "row",
    tab: "connections",
    id: "connections.port",
    label: "Port",
    description: `The port other ${MACHINE.plural} connect to`,
    keywords: ["port", "listen", "busy", "peer", "allow control", "network"],
  },
  "connections.hostUpdates": {
    kind: "row",
    tab: "connections",
    id: "connections.hostUpdates",
    label: "Update hosts automatically",
    description:
      "When lpm updates, each Linux host follows once none of its agents are working. Its terminals restart; services keep running.",
    keywords: ["linux", "server", "host", "upgrade", "update", "version", "auto"],
  },
  "connections.sync": {
    kind: "row",
    tab: "connections",
    id: "connections.sync",
    label: "Config sync",
    description: "Mirror projects and settings between connected machines",
    keywords: ["sync", "transfer", "mirror", "config", "peer", "mac", "linux"],
  },
} satisfies Record<string, SettingsRowEntry>;

export type SettingsRowId = keyof typeof ROWS;

const VIEW_ENTRIES: SettingsViewEntry[] = [
  {
    kind: "view",
    view: "global-config",
    id: "global-config",
    reach: "any",
    label: "Global config",
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
    reach: "attended",
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
    reach: "sameKeyboard",
  }));
}

function builtinShortcutEntries(tts: boolean): SettingsRowEntry[] {
  return builtinShortcutGroups(tts).flatMap((group) =>
    group.shortcuts.map((s): SettingsRowEntry => ({
      kind: "row",
      tab: "shortcuts",
      id: `shortcut.builtin.${s.id}`,
      label: s.label,
      description: s.description,
      keywords: ["keyboard", "hotkey", "shortcut", s.keys],
      reach: "sameKeyboard",
    })),
  );
}

function rowEntries(): SettingsRowEntry[] {
  return [...Object.values(ROWS), ...soundEntries(), ...shortcutEntries()];
}

export function rowReaches(id: SettingsRowId, machine: SettingsMachine): boolean {
  const row: SettingsRowEntry = ROWS[id];
  return reaches(machine, row.reach);
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
  mac?: boolean;
  machine?: SettingsMachine;
}): SettingsSearchEntry[] {
  const mac = ctx.mac ?? isMac;
  const machine = ctx.machine ?? LOCAL_MACHINE;
  const entries: SettingsSearchEntry[] = [
    ...rowEntries(),
    ...builtinShortcutEntries(ctx.experimentalTTS),
    ...VIEW_ENTRIES,
  ];
  return entries.filter((e) =>
    e.kind === "row"
      ? (e.tab !== "tts" || ctx.experimentalTTS) &&
        (mac || !e.macOnly) &&
        reaches(machine, e.reach, mac)
      : reaches(machine, e.reach, mac),
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
