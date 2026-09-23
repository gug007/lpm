import {
  BadgeCheck,
  Puzzle,
  Radio,
  Scale,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import { CONNECT_AGENTS_PATH } from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const CLI_AREA: FeatureArea = {
  id: "cli",
  title: "Let your scripts and agents drive lpm",
  description:
    "The lpm command and its agent skills give Claude Code, Codex, Gemini CLI, OpenCode, and your scripts the same controls you have in the app.",
  highlights: [
    {
      icon: SquareTerminal,
      title: "The lpm command",
      body: "List projects, start and stop services, read logs, check agent status, and run actions from any terminal. Most commands can print JSON for scripts, and inside a project the name is optional.",
      note: "Changes, live agent status, and automations need the running app. lpm list, logs, project, wait, and config validate also work while it's closed.",
      href: CONNECT_AGENTS_PATH,
      linkLabel: "The CLI for your agents",
    },
    {
      icon: Puzzle,
      title: "Agent skills",
      body: "Install lpm's skills from Settings and Claude Code, Codex, Gemini CLI, and OpenCode learn to control projects, edit configs safely, make copies, and use shared memory.",
    },
    {
      icon: Radio,
      title: "Status with no setup",
      body: "lpm adds its hooks to Claude Code and Codex so live status just works, and Settings can check and repair the Claude Code hooks.",
      note: "Only lpm's own entries are added, and Remove app takes them out.",
      scope: "claude-codex",
    },
  ],
  features: [
    {
      title: "lpm wait",
      body: "Block until a service is up, a port is listening, or a project's agents settle, which is handy before running tests.",
      mono: true,
    },
    {
      title: "lpm duplicate · lpm worktree",
      body: "Make 1 to 50 copies or worktrees in one command, and queue the same action or command, with an optional agent prompt, on each.",
      mono: true,
    },
    {
      title: "lpm run",
      body: "Open a terminal in the app and run an action or any command in it, optionally with a prompt for an agent.",
      mono: true,
    },
    {
      title: "lpm logs · lpm status",
      body: "Print a service's recent output, or each Claude Code and Codex session's state and how long it has lasted, plus any status posted with lpm set-status.",
      mono: true,
    },
    {
      title: "lpm config",
      body: "Validate config files, then read and apply changes that the app writes atomically, refusing if someone else changed the file first.",
      mono: true,
    },
    {
      title: "lpm automations",
      body: "List, run, stop, pause, and reply to automations from a terminal or a script.",
      mono: true,
    },
    {
      title: "lpm set-status",
      body: "Put your own tool's status on a project in the sidebar, with the same sounds and notifications agents get.",
      mono: true,
    },
    {
      title: "lpm pair · lpm mobile pair",
      body: "Pair a headless server with a Mac or an iPhone from its terminal. The phone's QR code draws right in the shell.",
      mono: true,
    },
    {
      title: "One-click install",
      body: "Settings puts lpm on your PATH, linked to the app, so the command updates whenever the app does.",
    },
  ],
};

export const PLATFORM_AREA: FeatureArea = {
  id: "platform",
  title: "Free, open source, and no telemetry",
  description:
    "lpm has no account and no paid tier, and the apps ship without analytics. Updating, backing up, and removing lpm are all built in.",
  highlights: [
    {
      icon: Scale,
      title: "Free and open source",
      body: "MIT-licensed, with the source and every release on GitHub. No account, no sign-up, no paid tier.",
    },
    {
      icon: ShieldCheck,
      title: "No telemetry in the apps",
      body: "The Mac app, the CLI, and the iPhone app include no analytics or crash reporting. The Mac app checks GitHub for updates; otherwise the apps go online only for features you turn on and things you start.",
      note: "Paired-iPhone pushes pass through lpm's relay, encrypted.",
    },
    {
      icon: BadgeCheck,
      title: "Signed and notarized",
      body: "Each macOS release is Developer ID signed and notarized by Apple, in one build for Apple Silicon and one for Intel.",
    },
  ],
  features: [
    {
      title: "One-click updates",
      body: "lpm checks for a new version at launch and daily. Click Update and it relaunches in place while your services keep running.",
    },
    {
      title: "Clean uninstall",
      body: "Remove app stops your projects, removes the CLI, skills, and agent hooks it added, and moves lpm to the Trash. Your project folders are left alone.",
    },
    {
      title: "Backup and transfer",
      body: "Export your projects and settings and import them on another Mac, and back up the key that encrypts your notes.",
    },
    {
      title: "Searchable settings",
      body: "Find any setting by name, choose Light, Dark, or System, and set a default folder for new projects.",
    },
    {
      title: "Rebindable shortcuts",
      body: "Rebind the Activity and tab-switching shortcuts. lpm refuses combinations that are already taken.",
      keys: ["⌘⇧A", "⌘⌥←", "⌘⌥→"],
    },
    {
      title: "Zoom any viewer",
      body: "Make text bigger in the file viewer, diffs, review screens, Memory, and Automations. Each one remembers its own zoom.",
      keys: ["⌘+", "⌘−", "⌘0"],
    },
    {
      title: "Close to the Dock",
      body: "Closing the window hides lpm so terminals and agent status keep going. The Dock menu lists every project and whether it's running.",
    },
    {
      title: "Crash recovery",
      body: "If the interface ever crashes, a recovery screen reloads it and can copy diagnostics to your clipboard. Nothing is uploaded.",
    },
    {
      title: "Support and feedback",
      body: "A guided form opens a pre-filled GitHub issue with your version attached. Nothing is sent until you submit it.",
    },
  ],
};
