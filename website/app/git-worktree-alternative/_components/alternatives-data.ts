import {
  Archive,
  Container,
  Copy,
  CopyPlus,
  FolderGit2,
  GitBranch,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { Verdict } from "./verdict-icon";

export type PropertyKey = "repository" | "branch" | "localFiles" | "edits";

export const PROPERTIES: { key: PropertyKey; label: string }[] = [
  { key: "repository", label: "Own repository" },
  { key: "branch", label: "Same branch twice" },
  { key: "localFiles", label: ".env & node_modules" },
  { key: "edits", label: "Uncommitted edits" },
];

export type ChipVerdict = Exclude<Verdict, "neutral">;

export type Chip = { verdict: ChipVerdict; note?: string };

export type Mechanism =
  | { kind: "command"; text: string; context?: string }
  | { kind: "menu"; steps: string[] };

export type CardTone = "gray" | "blue" | "emerald";

export type Alternative = {
  name: string;
  icon: LucideIcon;
  tone: CardTone;
  tag?: string;
  mechanisms: Mechanism[];
  gets: string;
  chips: Record<PropertyKey, Chip>;
  tradeOff: string;
  link?: { href: string; label: string };
};

export type AlternativeGroup = {
  id: string;
  label: string;
  hint: string;
  items: Alternative[];
};

const DEPENDS: Chip = { verdict: "partial", note: "depends" };

export const ALTERNATIVE_GROUPS: AlternativeGroup[] = [
  {
    id: "git",
    label: "Built into Git",
    hint: "Nothing to install.",
    items: [
      {
        name: "git stash + git switch",
        icon: Archive,
        tone: "gray",
        mechanisms: [{ kind: "command", text: "git stash && git switch -c try-2" }],
        gets: "The same folder, switched to another branch.",
        chips: {
          repository: { verdict: "no" },
          branch: { verdict: "no" },
          localFiles: { verdict: "yes", note: "same folder" },
          edits: { verdict: "no", note: "stashed" },
        },
        tradeOff:
          "Nothing runs side by side: every switch rewrites the files your editor, dev server and agent are working on.",
      },
      {
        name: "Another git clone",
        icon: FolderGit2,
        tone: "gray",
        mechanisms: [{ kind: "command", text: "git clone . ../shop-2" }],
        gets: "A separate repository, checked out fresh from your last commit.",
        chips: {
          repository: { verdict: "yes" },
          branch: { verdict: "yes" },
          localFiles: { verdict: "no" },
          edits: { verdict: "no" },
        },
        tradeOff:
          "Copy .env and install dependencies again by hand, and origin points at your local folder, not your Git host.",
      },
      {
        name: "git worktree add",
        icon: GitBranch,
        tone: "blue",
        tag: "Baseline",
        mechanisms: [
          { kind: "command", text: "git worktree add -b try-2 ../shop-2" },
        ],
        gets: "A second checkout linked to the same repository, on a new branch.",
        chips: {
          repository: { verdict: "no" },
          branch: { verdict: "no", note: "refused by default" },
          localFiles: { verdict: "no" },
          edits: { verdict: "no" },
        },
        tradeOff:
          "Light on disk, since history is shared. Worktree managers and setup scripts can copy .env and install dependencies, once for every worktree.",
      },
    ],
  },
  {
    id: "diy",
    label: "Other tools and recipes",
    hint: "More control, more to maintain.",
    items: [
      {
        name: "Copy-on-write folder copy",
        icon: Copy,
        tone: "gray",
        mechanisms: [
          {
            kind: "command",
            text: "cp -c -R ../shop ../shop-2",
            context: "macOS, APFS",
          },
          {
            kind: "command",
            text: "cp -R --reflink=auto ../shop ../shop-2",
            context: "Linux, btrfs or XFS",
          },
        ],
        gets: "The whole folder, with .git, your edits, .env and node_modules, sharing unchanged blocks with the original.",
        chips: {
          repository: { verdict: "yes" },
          branch: { verdict: "yes" },
          localFiles: { verdict: "yes" },
          edits: { verdict: "yes" },
        },
        tradeOff:
          "By hand every time. The copy inherits any worktree entries of the original, so Git refuses those branches in it, and build caches come along too.",
      },
      {
        name: "Jujutsu workspaces",
        icon: Layers,
        tone: "gray",
        mechanisms: [{ kind: "command", text: "jj workspace add ../shop-2" }],
        gets: "A second working copy of the same repository, started from your current change's parent.",
        chips: {
          repository: { verdict: "no" },
          branch: { verdict: "yes" },
          localFiles: { verdict: "no" },
          edits: { verdict: "partial", note: "with -r @" },
        },
        tradeOff:
          "Means moving your workflow to jj, and, like a worktree, each new workspace needs its setup again.",
      },
      {
        name: "Dev containers",
        icon: Container,
        tone: "gray",
        mechanisms: [
          { kind: "command", text: ".devcontainer/devcontainer.json" },
        ],
        gets: "Its own runtime (processes, ports, services) around files you clone, copy or mount in.",
        chips: {
          repository: DEPENDS,
          branch: DEPENDS,
          localFiles: DEPENDS,
          edits: DEPENDS,
        },
        tradeOff:
          "The heaviest setup: Docker, an image and a config to maintain. The only option here that can isolate ports and databases.",
      },
    ],
  },
  {
    id: "lpm",
    label: "In lpm",
    hint: "Both open the same dialog.",
    items: [
      {
        name: "lpm Duplicate",
        icon: CopyPlus,
        tone: "emerald",
        mechanisms: [
          { kind: "menu", steps: ["Right-click a project", "Duplicate"] },
        ],
        gets: "Up to 50 standalone copies of the folder you're working in, each a fast APFS copy-on-write clone. Build caches like .next stay behind.",
        chips: {
          repository: { verdict: "yes" },
          branch: { verdict: "yes" },
          localFiles: { verdict: "yes" },
          edits: { verdict: "yes" },
        },
        tradeOff:
          "Disk use grows as copies change, and ports and databases stay shared with the original.",
        link: { href: "#how-it-works", label: "See the Duplicate dialog" },
      },
      {
        name: "lpm New Worktree",
        icon: GitBranch,
        tone: "blue",
        mechanisms: [
          { kind: "menu", steps: ["Right-click a project", "New Worktree"] },
        ],
        gets: "Real Git worktrees on new lpm/<name> branches from the commit you're on, up to 50 at a time.",
        chips: {
          repository: { verdict: "no" },
          branch: { verdict: "no" },
          localFiles: { verdict: "partial", note: "install option" },
          edits: { verdict: "no" },
        },
        tradeOff:
          "Removing one also deletes its lpm/<name> branch, even unmerged, so push or merge first.",
        link: { href: "#when-to-use", label: "When a worktree is the better choice" },
      },
    ],
  },
];
