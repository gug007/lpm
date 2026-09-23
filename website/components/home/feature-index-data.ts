import {
  Activity,
  BellRing,
  Bot,
  Brain,
  CalendarClock,
  ChartColumn,
  CopyPlus,
  FileDiff,
  FolderGit2,
  FolderTree,
  GitBranch,
  GitMerge,
  GitPullRequestArrow,
  Laptop,
  Layers,
  MessageSquareText,
  MonitorSmartphone,
  MousePointerClick,
  PanelBottom,
  Play,
  Puzzle,
  ScanSearch,
  Server,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Terminal,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  FEATURES_PATH,
  GIT_TERMINAL_MAC_PATH,
  LINUX_HOST_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  PROJECT_SIDEBAR_PATH,
  REVIEW_CHANGES_PATH,
  SKILLS_PATH,
  SSH_TERMINAL_MAC_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";

export type IndexItem = {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  keys?: string;
};

export type IndexGroupId = "run" | "agents" | "monitor" | "ship" | "devices";

export type IndexGroup = {
  id: IndexGroupId;
  icon: LucideIcon;
  title: string;
  blurb: string;
  items: IndexItem[];
  note?: string;
};

export const FEATURE_INDEX: IndexGroup[] = [
  {
    id: "run",
    icon: FolderGit2,
    title: "Run projects",
    blurb: "Point lpm at a folder and press Start.",
    items: [
      {
        icon: ScanSearch,
        title: "Services found for you",
        body: "Add or clone a repo and lpm sets up the dev servers it finds, monorepo apps included.",
        href: `${FEATURES_PATH}#projects`,
      },
      {
        icon: Play,
        title: "One-click start and profiles",
        body: "Start the whole stack, or just a profile like “backend only”.",
        href: `${FEATURES_PATH}#projects`,
      },
      {
        icon: MousePointerClick,
        title: "Buttons for your commands",
        body: "Tests, migrations and deploys become one-click actions.",
        href: `${FEATURES_PATH}#projects`,
      },
      {
        icon: SquareTerminal,
        title: "Live output, real ports",
        body: "A tab per service with the ports it listens on. Port clashes are caught before Start.",
        href: BEST_TERMINAL_MAC_PATH,
      },
      {
        icon: Layers,
        title: "Several projects at once",
        body: "Run projects side by side and jump between them from the keyboard.",
        href: PROJECT_SIDEBAR_PATH,
        keys: "⌃Tab",
      },
    ],
  },
  {
    id: "agents",
    icon: Sparkles,
    title: "AI agents",
    blurb: "Claude Code and Codex, side by side.",
    items: [
      {
        icon: Bot,
        title: "Claude Code, Codex, Gemini, OpenCode",
        body: "One-click launch buttons, with a model and effort picker for Claude Code and Codex.",
        href: AI_AGENTS_PATH,
      },
      {
        icon: BellRing,
        title: "See who’s waiting on you",
        body: "Working, done or needs you on every tab and in the sidebar, with sounds and banners.",
        href: `${FEATURES_PATH}#agents`,
      },
      {
        icon: MessageSquareText,
        title: "A composer for prompts",
        body: "@ files and logs, paste screenshots, and pick / commands with hints.",
        href: `${FEATURES_PATH}#composer`,
      },
      {
        icon: CopyPlus,
        title: "Run in duplicates",
        body: "Run one prompt 2–10 times at once, here and in fresh copies, then keep the best result.",
        href: PARALLEL_PATH,
      },
      {
        icon: GitBranch,
        title: "Copies and Git worktrees",
        body: "Duplicate a project with its .env and node_modules, or create linked worktrees.",
        href: WORKTREE_AGENTS_PATH,
      },
      {
        icon: Brain,
        title: "Memory shared between agents",
        body: "Save a work session in one agent and continue it by name in another.",
        href: `${FEATURES_PATH}#agent-setup`,
      },
      {
        icon: Users,
        title: "Multiple Claude Code accounts",
        body: "Pin Work, Personal or Client accounts to projects, each signed in once.",
        href: CLAUDE_ACCOUNTS_PATH,
      },
      {
        icon: PanelBottom,
        title: "Status line designer",
        body: "Choose what Claude Code and Codex show at the bottom: model, branch, context, limits.",
        href: STATUSLINE_PATH,
      },
    ],
    note: "Live status, alerts, slash commands, resume, fork and model switching are for Claude Code and Codex only.",
  },
  {
    id: "ship",
    icon: GitMerge,
    title: "Review and ship",
    blurb: "Check the diff, commit, open a PR.",
    items: [
      {
        icon: FileDiff,
        title: "Review every change",
        body: "All uncommitted changes, including your agent’s, in one editable diff.",
        href: REVIEW_CHANGES_PATH,
      },
      {
        icon: GitPullRequestArrow,
        title: "AI commits and pull requests",
        body: "Your agent writes the message; one step can branch, commit, push and open a GitHub PR.",
        href: GIT_TERMINAL_MAC_PATH,
      },
      {
        icon: FolderTree,
        title: "Files tab",
        body: "Browse and edit project files with quick open and Git status colors.",
        href: `${FEATURES_PATH}#git`,
        keys: "⌘P",
      },
    ],
  },
  {
    id: "monitor",
    icon: Workflow,
    title: "Automate and monitor",
    blurb: "See what your agents are doing and using.",
    items: [
      {
        icon: Activity,
        title: "Activity view",
        body: "Claude Code and Codex agents, services and automations, with what needs you on top.",
        href: `${FEATURES_PATH}#agents`,
        keys: "⌘⇧A",
      },
      {
        icon: CalendarClock,
        title: "Automations",
        body: "Schedule prompts, commands and actions. They fire only with lpm open on an awake Mac.",
        href: AUTOMATIONS_PATH,
      },
      {
        icon: ChartColumn,
        title: "Token stats and plan limits",
        body: "Claude Code and Codex tokens, estimated cost, and 5-hour and weekly meters.",
        href: TOKEN_USAGE_PATH,
      },
      {
        icon: Puzzle,
        title: "Skills and tools inspector",
        body: "See the skills, MCP servers and hooks Claude Code and Codex load, and write new skills.",
        href: SKILLS_PATH,
      },
      {
        icon: Terminal,
        title: "lpm CLI and agent skills",
        body: "Start, stop, wait on and duplicate projects from any shell, or let your agents do it.",
        href: CONNECT_AGENTS_PATH,
      },
    ],
  },
  {
    id: "devices",
    icon: MonitorSmartphone,
    title: "Across devices",
    blurb: "Your projects, wherever they run.",
    items: [
      {
        icon: Smartphone,
        title: "iPhone app",
        body: "lpm link mirrors your terminals live, shows who needs you, and sends push alerts.",
        href: MOBILE_PATH,
      },
      {
        icon: Server,
        title: "SSH projects",
        body: "Run a project’s terminals, services and actions on any server you can SSH into.",
        href: SSH_TERMINAL_MAC_PATH,
      },
      {
        icon: Laptop,
        title: "Other Macs and Linux servers",
        body: "Pair another Mac, or add a Linux server with one SSH string, and drive it from your sidebar.",
        href: LINUX_HOST_PATH,
      },
    ],
  },
];

export const FEATURE_INDEX_FACTS = [
  "Apple Silicon and Intel builds",
  "Any stack that runs in a terminal",
  "No Docker required",
  "Dev servers keep running after you quit",
];
