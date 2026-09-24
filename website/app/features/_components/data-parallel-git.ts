import {
  Copy,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
} from "lucide-react";
import {
  GIT_TERMINAL_MAC_PATH,
  PARALLEL_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import type { FeatureArea } from "./feature-types";

export const PARALLEL_AREA: FeatureArea = {
  id: "parallel",
  title: "Run agents side by side, each in its own folder",
  description:
    "Make standalone copies or Git worktrees of a project, give each one its own task, and keep the result you like best.",
  highlights: [
    {
      icon: Copy,
      title: "Duplicate a project",
      body: "Make up to 50 independent copies at once. On APFS they're copy-on-write clones that bring your .env files and node_modules along and leave build output and caches behind.",
      href: WORKTREE_ALTERNATIVE_PATH,
      linkLabel: "Git worktree alternative",
    },
    {
      icon: GitBranch,
      title: "Git worktrees",
      body: "Create one or many linked worktrees, each on its own new branch from the current commit and sharing the repo's history.",
      note: "Uncommitted and ignored files don't carry over.",
      href: WORKTREE_AGENTS_PATH,
      linkLabel: "Worktrees for AI agents",
    },
    {
      icon: Layers,
      title: "Run in duplicates",
      body: "Pick Run in duplicates from the Send menu to start one prompt 2 to 10 times: the current terminal plus new copies of the project, one agent per copy. Keep the run that wins.",
      href: `${PARALLEL_PATH}#fan-out`,
      linkLabel: "How parallel runs work",
    },
  ],
  features: [
    {
      title: "Copy options",
      body: "Keep committed work only, pull the latest changes, or reinstall Node dependencies in each copy, and group the copies into a sidebar folder.",
    },
    {
      title: "A task for every copy",
      body: "While duplicating, have each copy run an action, a shell command, or an agent prompt with images. Use the same task for all of them or one each.",
    },
    {
      title: "Copies stay organized",
      body: "Copies and worktrees nest under their original with their own labels. A collapsed stack sums up what's working, blocked, or waiting on you.",
    },
    {
      title: "Copies inherit your setup",
      body: "Every copy keeps the original's services and actions, and can keep its Claude account, so it's ready to start.",
    },
    {
      title: "Shared memory across copies",
      body: "Copies and worktrees share the original's session memory, so an agent in one copy can pick up where another left off.",
    },
    {
      title: "Copies on another Mac",
      body: "If a paired Mac has this project too, you can place each new copy on that Mac instead.",
    },
    {
      title: "Ports stay in your hands",
      body: "Copies run the same commands as the original, so give each one its own port, for example through a PORT variable. lpm flags a clash before starting.",
      note: "lpm doesn't isolate ports or containers.",
    },
    {
      title: "Clean up in one step",
      body: "Deleting a copy removes its folder. Deleting a worktree also deletes its branch, so push anything you want to keep.",
    },
    {
      title: "From the CLI or your phone",
      body: "lpm duplicate and lpm worktree make 1 to 50 copies from any terminal or agent, and the iPhone app can make folder copies too.",
    },
  ],
};

export const GIT_AREA: FeatureArea = {
  id: "git",
  title: "Review what the agent wrote, then ship it",
  description:
    "See every uncommitted change as one diff, commit with an AI-written message, and open a GitHub pull request without leaving the app.",
  highlights: [
    {
      icon: FileDiff,
      title: "Review every change",
      body: "All uncommitted changes as one scrolling diff stack beside a tree of changed files, split or unified. Edit and save in the diff, and lpm won't overwrite a file an agent changed meanwhile.",
      keys: ["⌘⇧R"],
      href: REVIEW_CHANGES_PATH,
      linkLabel: "Review changes",
    },
    {
      icon: GitCommitHorizontal,
      title: "AI commit messages",
      body: "Pick files, then let your installed agent CLI write a conventional-commit message from the diff. Auto Commit does it all in one click, and can push too.",
      note: "Uses Claude Code, Codex, Gemini CLI, or OpenCode on your Mac.",
      href: GIT_TERMINAL_MAC_PATH,
      linkLabel: "Git in lpm",
    },
    {
      icon: GitPullRequest,
      title: "Auto Create PR",
      body: "Go from uncommitted work to an open pull request in one step: a new AI-named branch if you're on the default one, a commit, a push, and a written title and description.",
      scope: "github",
    },
  ],
  features: [
    {
      title: "Commit dialog",
      body: "Tick files or whole folders, see each diff inline, discard what you don't want, then commit or commit and push.",
      note: "Whole files only; there's no line-level staging.",
      keys: ["⌘↩"],
    },
    {
      title: "Pull request dialog",
      body: "Pick a base branch, see the commits it will include, and have AI write the title and description.",
      scope: "github",
    },
    {
      title: "PR status in the footer",
      body: "When your branch has a pull request, the footer shows PR #N colored by state. Click it to open the PR.",
      scope: "github",
    },
    {
      title: "Branch switcher",
      body: "Search local and remote branches by age, check one out from the keyboard, rename or delete one, or create a branch with an AI-suggested name.",
    },
    {
      title: "Merge with AI conflict help",
      body: "Pick a branch to merge in. When Git reports conflicts, Resolve with AI clears the conflict markers and stages the files for your review; the commit stays yours.",
    },
    {
      title: "Sync, publish, pull, push",
      body: "Ahead and behind counts in the footer, one-click Publish and sync, and saved defaults like rebase on pull or force-with-lease on push.",
    },
    {
      title: "Your rules for AI git text",
      body: "Tell lpm how to write commit messages, PR titles and descriptions, and branch names, for every project or just one.",
    },
    {
      title: "Git from the sidebar",
      body: "Right-click any project to pull, push, fetch, switch branch, commit, create a PR, or discard changes without opening it.",
    },
    {
      title: "Files tab",
      body: "A file tree with Git status colors beside a code editor with syntax highlighting. Jump to any file by name and save with ⌘S.",
      note: "A lightweight editor, not an IDE.",
      keys: ["⌘⇧E", "⌘P"],
    },
    {
      title: "Markdown, image, and video preview",
      body: "Markdown renders the way GitHub shows it, images open with zoom, and videos play inline.",
    },
    {
      title: "Open at the exact line",
      body: "Send a file to Cursor, VS Code, Windsurf, Zed, Sublime Text, or WebStorm at the same line and column.",
    },
    {
      title: "Always current",
      body: "Branch, counts, changed files, and diffs refresh on their own as you or an agent edit, commit, or switch branches.",
    },
  ],
};
