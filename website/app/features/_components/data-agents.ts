import { AtSign, BellRing, Bot, MessageSquareText, Radio, Slash } from "lucide-react";
import { AI_AGENTS_PATH, PROJECT_SIDEBAR_PATH } from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const AGENTS_AREA: FeatureArea = {
  id: "agents",
  title: "A terminal built for Claude Code and Codex",
  description:
    "Every project gets its own terminals next to its services. Claude Code and Codex get live status, alerts, and session tools; Gemini CLI and OpenCode launch with one click too.",
  highlights: [
    {
      icon: Bot,
      title: "One-click agent launchers",
      body: "A fresh install adds Claude and Codex buttons to every project, and lpm suggests Claude Code, Codex, Gemini CLI, or OpenCode launchers for the CLIs you have. Any other command can be a button too.",
      note: "You install and sign in to the agent CLIs yourself.",
      href: AI_AGENTS_PATH,
      linkLabel: "lpm for AI agents",
    },
    {
      icon: Radio,
      title: "Live agent status",
      body: "Each Claude Code and Codex tab shows whether it's Working, Needs you, Done, or Problem. The sidebar lists every session under its project with a running timer; click one to open its tab.",
      scope: "claude-codex",
      href: PROJECT_SIDEBAR_PATH,
      linkLabel: "Status in the sidebar",
    },
    {
      icon: BellRing,
      title: "Alerts when an agent needs you",
      body: "Pick a chime, a macOS sound, or your own audio file for when an agent is done, wants approval, or fails, plus a macOS banner whenever lpm is in the background.",
      scope: "claude-codex",
    },
  ],
  features: [
    {
      title: "Terminal tabs per project",
      body: "New tabs open in the project folder with your login shell, right next to the project's service output.",
      keys: ["⌘T", "⌘W"],
    },
    {
      title: "Split panes",
      body: "Split right or down, drag tabs between panes, and let one pane fill the window. Each project remembers its layout.",
      keys: ["⌘D", "⌘⇧D"],
    },
    {
      title: "Activity view",
      body: "Agents, services, and automations across your projects on one screen, with whatever needs you on top. Filter, search, and move with j and k.",
      keys: ["⌘⇧A"],
      note: "Agent rows cover Claude Code and Codex in projects opened this session.",
    },
    {
      title: "Resume past sessions",
      body: "Browse every Claude Code and Codex conversation for a project, including ones started outside lpm, search them, and reopen one in a new tab.",
      scope: "claude-codex",
    },
    {
      title: "Session restore",
      body: "Reopen lpm and your tabs and splits come back. Claude Code and Codex tabs pick up their conversation, and button tabs re-run their command.",
      note: "Plain shells start fresh.",
    },
    {
      title: "Fork a conversation",
      body: "Branch an agent conversation into a new tab, or into a fresh copy of the whole project, and keep the original as it was.",
      scope: "claude-codex",
    },
    {
      title: "Tabs that keep up",
      body: "Claude Code and Codex tabs take the conversation's title. Rename any tab, give it an emoji, pin it against ⌘W, or undo an accidental close within a few seconds.",
    },
    {
      title: "Find and filter output",
      body: "Search a terminal or service log, or filter it down to only the matching lines, with a match count.",
      keys: ["⌘F"],
    },
    {
      title: "Smart copy, clickable paths",
      body: "Copying rejoins wrapped lines and strips the margins agents draw. File paths, including path:line:col, open at that line, and URLs open in your browser.",
    },
    {
      title: "Clipboard from terminal apps",
      body: "When a program in the terminal copies text, such as Claude Code copying its own selection, it lands in your Mac's clipboard.",
    },
    {
      title: "Paste screenshots for agents",
      body: "Paste an image or drop files on a terminal and lpm types the file path for the agent to read. On SSH hosts and other Macs, files are uploaded first.",
    },
    {
      title: "Standalone terminals",
      body: "Quick shells that aren't tied to a project, with the same tabs, splits, composer, and agent status.",
    },
    {
      title: "Detached windows",
      body: "Pop a project into its own window. Services stream in both windows, while each terminal is live in one at a time and Take control moves it. Detached windows reopen where you left them.",
    },
    {
      title: "Browser tab",
      body: "A lightweight web tab next to your terminals, with its own URL field and back, forward, and reload buttons.",
    },
    {
      title: "Themes and fonts",
      body: "Eight terminal color themes, any monospace font on your Mac, sizes from 8 to 24, and adjustable line height.",
      keys: ["⌘+", "⌘−"],
    },
  ],
};

export const COMPOSER_AREA: FeatureArea = {
  id: "composer",
  title: "Write prompts in an editor, not a shell prompt",
  description:
    "A multi-line composer sits under every terminal and works with any CLI. Slash commands, model switching, and copying answers are for Claude Code and Codex.",
  highlights: [
    {
      icon: MessageSquareText,
      title: "A composer under every terminal",
      body: "Write with normal text editing and undo, press Enter to send and Shift+Enter for a new line. Hide it with ⌘I and a slim bar keeps the agent's status in view.",
      keys: ["⌘I"],
    },
    {
      icon: AtSign,
      title: "@ mentions",
      body: "Reference files, folders, changed files, branches, other projects and their copies, another tab's output, a running service's logs, or saved memory sessions.",
    },
    {
      icon: Slash,
      title: "Slash commands with hints",
      body: "Type / to see the agent's commands, your custom commands, and skills, with the expected argument shown as a gray hint once you pick one.",
      scope: "claude-codex",
    },
  ],
  features: [
    {
      title: "Images and files",
      body: "Paste screenshots or drop files into the composer. They show as thumbnails you can preview, and become file paths the agent can read.",
    },
    {
      title: "Switch model and effort",
      body: "Move a running session to another model or reasoning effort from the menu next to Send, without restarting it.",
      scope: "claude-codex",
    },
    {
      title: "Refine with AI",
      body: "Rewrite a prompt before sending: improve it, make it concise, fix grammar, add acceptance criteria, plan first, or use your own rewrites, with up to five versions to pick from.",
      note: "Runs through your own agent CLI and plan.",
    },
    {
      title: "Copy the last answer",
      body: "Copy the agent's last answer as clean text straight from the conversation, tables and markdown intact, or pick one of the 20 most recent.",
      scope: "claude-codex",
    },
    {
      title: "Prompt tabs and drafts",
      body: "Keep several drafts per terminal as prompt tabs. Unsent text survives quitting, and Save as draft files a prompt away for later.",
      keys: ["⌘⇧T", "⌘⇧W"],
    },
    {
      title: "History and favorites",
      body: "Press ↑ to recall earlier prompts, or search past prompts across projects, star favorites, and file them into folders.",
      keys: ["↑"],
    },
    {
      title: "Send to another tab",
      body: "Send what you're writing to any other open tab, even one on a paired Mac, to run right away or wait in that tab's composer.",
    },
    {
      title: "Voice dictation",
      body: "Tap the mic to dictate a prompt instead of typing it.",
      note: "Uses the separate, free VoiceToText Mac app.",
    },
    {
      title: "Your toolbar, your way",
      body: "Choose which composer tools sit on the toolbar and which live in the More menu, or reset to the default.",
    },
  ],
};
