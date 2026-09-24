import { CopyPlus, FolderGit2, GitBranch, type LucideIcon } from "lucide-react";
import type { Verdict } from "./verdict-icon";

export type ComparisonColumn = {
  name: string;
  kind: string;
  icon: LucideIcon;
  iconTone: string;
};

export type ComparisonCellValue = {
  verdict: Verdict;
  value: string;
  detail?: string;
  mono?: "value" | "detail";
};

export type ComparisonRow = {
  label: string;
  cells: [ComparisonCellValue, ComparisonCellValue, ComparisonCellValue];
};

export const COMPARISON_COLUMNS: ComparisonColumn[] = [
  {
    name: "Git worktree",
    kind: "Linked checkout",
    icon: GitBranch,
    iconTone: "text-blue-600 dark:text-blue-300",
  },
  {
    name: "git clone",
    kind: "Second repository",
    icon: FolderGit2,
    iconTone: "text-gray-500 dark:text-gray-400",
  },
  {
    name: "lpm Duplicate",
    kind: "Standalone copy",
    icon: CopyPlus,
    iconTone: "text-emerald-600 dark:text-emerald-300",
  },
];

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Git relationship",
    cells: [
      {
        verdict: "neutral",
        value: "Linked to the original repository",
        detail: "Shares its history, refs, config and hooks",
      },
      {
        verdict: "neutral",
        value: "A separate repository",
        detail: "Local clones hardlink object files; origin is the source folder",
      },
      {
        verdict: "neutral",
        value: "A separate repository, history included",
        detail: "A copy of .git, minus the original's worktree entries",
      },
    ],
  },
  {
    label: "Starting point",
    cells: [
      {
        verdict: "neutral",
        value: "A commit, usually on a new branch",
        detail: "Files exactly as they were committed",
      },
      {
        verdict: "neutral",
        value: "The last commit on your branch",
        detail: "A fresh checkout; your working folder isn't copied",
      },
      {
        verdict: "neutral",
        value: "Your folder as it is right now",
        detail: "Pull latest changes, on by default, tries to fast-forward it",
      },
    ],
  },
  {
    label: "Same branch twice",
    cells: [
      {
        verdict: "no",
        value: "Refused by default",
        detail: "fatal: 'main' is already used by worktree",
        mono: "detail",
      },
      {
        verdict: "yes",
        value: "Yes",
        detail: "It has its own refs",
      },
      {
        verdict: "yes",
        value: "Yes, on your current branch",
        detail: "Each copy has its own refs",
      },
    ],
  },
  {
    label: ".env and ignored files",
    cells: [
      {
        verdict: "no",
        value: "Left behind",
        detail: "Only tracked files are checked out",
      },
      {
        verdict: "no",
        value: "Left behind",
        detail: "Only committed files come across",
      },
      {
        verdict: "yes",
        value: "Copied",
        detail: "Except folders named like caches: .next, dist, build, out, target",
      },
    ],
  },
  {
    label: "node_modules",
    cells: [
      {
        verdict: "no",
        value: "Install again",
        detail: "One npm install per worktree",
      },
      {
        verdict: "no",
        value: "Install again",
        detail: "Plus .env and any other local setup",
      },
      {
        verdict: "yes",
        value: "Copied, copy-on-write",
        detail: "Or installed fresh with Reinstall dependencies",
      },
    ],
  },
  {
    label: "Uncommitted edits",
    cells: [
      {
        verdict: "no",
        value: "Stay in the original folder",
        detail: "Commits are shared between worktrees; working files aren't",
      },
      {
        verdict: "no",
        value: "Stay in the original folder",
        detail: "Commit first, then fetch them into the clone",
      },
      {
        verdict: "yes",
        value: "Come along by default",
        detail: "Committed work only drops them and keeps .env",
      },
    ],
  },
  {
    label: "Agent launch",
    cells: [
      {
        verdict: "no",
        value: "Not part of Git",
        detail: "Open each worktree and start the agent yourself",
      },
      {
        verdict: "no",
        value: "Not part of Git",
        detail: "Script it yourself, once per clone",
      },
      {
        verdict: "yes",
        value: "An action or command on each copy",
        detail: "Plus a prompt for Claude Code, Codex, Gemini or OpenCode",
      },
    ],
  },
  {
    label: "Ports and databases",
    cells: [
      {
        verdict: "no",
        value: "Shared",
        detail: "Two dev servers still want port 3000",
      },
      {
        verdict: "no",
        value: "Shared",
        detail: "Same ports, same local database",
      },
      {
        verdict: "no",
        value: "Shared",
        detail: "lpm checks declared ports on start: Stop & start or Cancel",
      },
    ],
  },
  {
    label: "Disk",
    cells: [
      {
        verdict: "neutral",
        value: "Working files only",
        detail: "History stays in the original repository",
      },
      {
        verdict: "neutral",
        value: "Working files, history hardlinked",
        detail: "About a worktree's size when cloned on the same disk",
      },
      {
        verdict: "neutral",
        value: "Copy-on-write clone on APFS",
        detail: "Shares unchanged blocks; a full copy where cloning isn't supported",
      },
    ],
  },
  {
    label: "Removal",
    cells: [
      {
        verdict: "neutral",
        value: "git worktree remove",
        detail: "Refuses unclean worktrees unless forced; the branch stays",
        mono: "value",
      },
      {
        verdict: "neutral",
        value: "Delete the folder",
        detail: "Nothing else refers to it",
      },
      {
        verdict: "neutral",
        value: "Delete it from the sidebar",
        detail: "Deleted from disk for good, not moved to the Trash",
      },
    ],
  },
];
