import { Copy, GitBranch, PanelsLeftRight, type LucideIcon } from "lucide-react";

export type Way = {
  step: string;
  name: string;
  icon: LucideIcon;
  keys?: string[];
  entry: string;
  body: string;
  useWhen: string[];
  watchOut: string;
};

export const WAYS: Way[] = [
  {
    step: "Same folder",
    name: "Tabs and splits in one project",
    icon: PanelsLeftRight,
    keys: ["⌘T", "⌘D"],
    entry: "New tab or split right",
    body: "Open another agent tab, or split the pane to watch two at once. Every agent works in the same folder, on the same branch, beside the same running dev server.",
    useWhen: [
      "The tasks touch different files",
      "One agent writes while another reviews or answers questions",
      "You want no setup at all",
    ],
    watchOut: "Two agents editing the same file overwrite each other.",
  },
  {
    step: "A copy per agent",
    name: "Duplicates",
    icon: Copy,
    entry: "Right-click a project → Duplicate",
    body: "Make 1 to 50 standalone copies at once, fast on APFS. Each copies the project folder — uncommitted work, .env files and node_modules included — and gets its own Git repository.",
    useWhen: [
      "You want several attempts at one task and keep the best",
      "The agent needs your local setup to run and test",
      "Your changes aren’t committed yet",
    ],
    watchOut: "Copies take disk space as they drift from the original.",
  },
  {
    step: "A branch per agent",
    name: "Git worktrees",
    icon: GitBranch,
    entry: "Right-click a project → New Worktree",
    body: "Create 1 to 50 linked worktrees, each on its own lpm/<name> branch from the current commit and sharing your repository’s history. For Node projects, lpm can install dependencies in each one.",
    useWhen: [
      "Each task should end as its own branch and pull request",
      "Your work is committed",
      "You want a clean checkout without local leftovers",
    ],
    watchOut: "Uncommitted work, .env files and node_modules stay behind.",
  },
];

export const WAY_COLUMNS = ["Tabs & splits", "Duplicates", "Worktrees"] as const;

export type WayRow = {
  label: string;
  cells: [string, string, string];
};

export const WAY_ROWS: WayRow[] = [
  {
    label: "Own folder per agent",
    cells: ["No — one shared folder", "Yes", "Yes"],
  },
  {
    label: "Uncommitted work",
    cells: ["Shared as you go", "Copied, or committed only", "Left behind"],
  },
  {
    label: ".env and node_modules",
    cells: ["Shared", "Copied", "Left behind; Node install optional"],
  },
  {
    label: "Git",
    cells: [
      "Same checkout and branch",
      "Own repository, same branch",
      "New lpm/<name> branch",
    ],
  },
  {
    label: "Ports, databases, Docker",
    cells: ["Shared", "Shared", "Shared"],
  },
  {
    label: "Removing it",
    cells: ["Close the tab", "Deletes the folder", "Deletes the folder and branch"],
  },
];
