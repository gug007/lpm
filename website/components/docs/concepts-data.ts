import { docsPath } from "@/lib/docs-pages";

export type Concept = {
  id: string;
  term: string;
  body: string;
  href: string;
  // Where the thing sits in public/docs/lpm-window.jpg, as a percentage of
  // the picture's width and height. Re-measure when the picture is retaken.
  pin?: { x: number; y: number };
};

export const CONCEPTS: Concept[] = [
  {
    id: "project",
    term: "Project",
    body: "A folder of code with its services, buttons and terminals. Each one is a row in the sidebar.",
    href: docsPath("project"),
    pin: { x: 25.4, y: 12.8 },
  },
  {
    id: "service",
    term: "Service",
    body: "A command that keeps running, such as a dev server. Start boots a project's services together, each in a tab of its own.",
    href: docsPath("services"),
    pin: { x: 41, y: 9.7 },
  },
  {
    id: "action",
    term: "Action",
    body: "A command that runs once, as a button: tests, migrations, deploys.",
    href: docsPath("actions"),
    pin: { x: 70, y: 6.6 },
  },
  {
    id: "terminal",
    term: "Terminal",
    body: "A tab that stays open: Claude Code, Codex, or a plain shell.",
    href: docsPath("terminals"),
    pin: { x: 61.1, y: 9.7 },
  },
  {
    id: "agent-status",
    term: "Agent status",
    body: "Working, Needs you, Done or Problem, shown on the agent's tab and under its project in the sidebar.",
    href: docsPath("agents"),
    pin: { x: 25.4, y: 43.8 },
  },
  {
    id: "copy-and-worktree",
    term: "Copy and worktree",
    body: "A second folder of the same project, so each agent edits its own files. Copies sit under their original in the sidebar; none are open in this picture.",
    href: docsPath("copies-and-worktrees"),
  },
  {
    id: "profile",
    term: "Profile",
    body: "A named set of services, such as backend only. Pick one from the menu next to Start.",
    href: docsPath("profiles"),
    pin: { x: 96.6, y: 7.2 },
  },
  {
    id: "automation",
    term: "Automation",
    body: "A prompt, command or action that runs on a schedule, or when something happens. Automations live under More.",
    href: docsPath("automations"),
    pin: { x: 11.8, y: 94.4 },
  },
];
