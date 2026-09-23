import { MousePointerClick, Play, ScanSearch } from "lucide-react";
import { CONFIG_PATH, PROJECT_SIDEBAR_PATH } from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const PROJECTS_AREA: FeatureArea = {
  id: "projects",
  title: "Add a project once. Start it all with one click.",
  description:
    "lpm reads each repo, sets up its dev servers, and gives every project a Start button, live output, and one-click commands.",
  highlights: [
    {
      icon: ScanSearch,
      title: "Automatic service detection",
      body: "Add a folder or clone a repo and lpm reads its files to set up start commands, working folders, and ports. It knows Node, Python, Rails, Laravel, Phoenix, Spring, .NET, Go, Rust, Docker Compose, Procfiles, and Make or just tasks, monorepo workspaces included.",
      note: "Rule-based and offline. Runs when you add or clone a local project.",
    },
    {
      icon: Play,
      title: "One-click start and stop",
      body: "One button starts or stops every dev server in a project, or just a saved profile like “backend only”. lpm checks for busy ports first, and the sidebar dot turns green while it runs.",
      href: PROJECT_SIDEBAR_PATH,
      linkLabel: "The project sidebar",
    },
    {
      icon: MousePointerClick,
      title: "Action buttons",
      body: "Turn tests, builds, deploys, migrations, and log tails into one-click buttons in the project header or terminal footer. A three-step wizard covers what it does, how it looks, and how it runs.",
      href: CONFIG_PATH,
      linkLabel: "Configuration docs",
    },
  ],
  features: [
    {
      title: "Four ways to add a project",
      body: "Add a local folder, clone a Git repository (optionally a single branch), connect an SSH host, or start from a template.",
    },
    {
      title: "Project templates",
      body: "Scaffold a new project from a template that gives Claude Code, Codex, Gemini CLI, or OpenCode a prompt, or runs a setup command. A Next.js template is built in, and you can add your own.",
    },
    {
      title: "Services keep running after you quit",
      body: "Quit or update lpm and your dev servers stay up. Reopen it and lpm finds them again.",
      note: "In-app terminals end on quit, and nothing survives a reboot.",
    },
    {
      title: "Profiles",
      body: "Save named groups of services and start exactly that set. Start remembers the profile you used last.",
    },
    {
      title: "Toggle single services",
      body: "Start or stop any one service while the rest keep running. Services it depends on start first, in order.",
    },
    {
      title: "Live output with real ports",
      body: "Each service gets its own read-only output tab showing the ports it is actually listening on. The All tab shows every service side by side.",
    },
    {
      title: "Port conflicts, explained",
      body: "When a port is taken, lpm names the holder, whether another lpm project or a process and its PID, and can stop it and start yours in one click.",
      note: "lpm checks ports. It doesn't assign or isolate them.",
    },
    {
      title: "Open in the browser",
      body: "Open localhost on the port a running service is really listening on, from the sidebar, the service tab, or Activity.",
    },
    {
      title: "Four ways to run an action",
      body: "In a new or reused terminal, once with the output in a pop-up, typed into the current terminal, or in the background with a live card you can cancel or copy.",
    },
    {
      title: "Suggested actions",
      body: "Start from templates or from suggestions found in your project: package.json scripts, Makefile targets, just recipes, and Cargo, Go, and Python test commands.",
    },
    {
      title: "Inputs and confirmations",
      body: "An action can ask for values before it runs, such as free text, a choice, or a hidden secret, and ask you to confirm risky commands like deploys.",
    },
    {
      title: "Shortcuts, menus, and colors",
      body: "Give any action its own keyboard shortcut, drag actions into split buttons or dropdown menus, and style them with an emoji and a color.",
    },
    {
      title: "AI-drafted config and actions",
      body: "Let Claude Code, Codex, Gemini CLI, or OpenCode inspect a project and draft its services, actions, and profiles, or describe an action in plain words. Nothing is saved until you review it.",
    },
    {
      title: "Form or source editor",
      body: "Edit a project in a form, or switch to the source with autocomplete, inline validation, and ⌘S to save. Edits made outside lpm show up right away.",
    },
    {
      title: "Personal, team, and global setups",
      body: "Keep settings just for you, share them with everyone who clones the repo through a checked-in config file, or add actions and terminals to every project.",
    },
    {
      title: "Open in your editor",
      body: "Open a project in Cursor, VS Code, Windsurf, Zed, Xcode, WebStorm, Sublime Text, Terminal, iTerm, Ghostty, Warp, or Finder. Only apps you have installed are listed.",
    },
    {
      title: "Folders and work statuses",
      body: "Group projects into collapsible sidebar folders, drag to reorder, and tag projects In progress, Blocked, Review, Done, or your own emoji status.",
    },
    {
      title: "Fast switching",
      body: "Jump straight to a project, flip between recent ones like switching apps, and hide or resize the sidebar.",
      keys: ["⌘1–9", "⌃Tab", "⌘B"],
    },
  ],
};
