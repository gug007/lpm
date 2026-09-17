// Git status on the tree the way VS Code's explorer shows it: a changed file's
// name takes its status colour and a letter, and a folder holding changes
// takes the colour of its most telling file and a dot.
import { ancestorsOf } from "./treeModel";
import type { ChangedFile } from "./useChangedFiles";

export interface Decoration {
  letter: string;
  text: string;
  dot: string;
  strike?: boolean;
}

// VS Code's own git colours; globals.css sets the tokens per theme. Spelled
// out so Tailwind finds each utility in the source.
const UNTRACKED = {
  text: "text-[var(--git-untracked)]",
  dot: "bg-[var(--git-untracked)]",
};

export const DECORATIONS: Record<string, Decoration> = {
  modified: {
    letter: "M",
    text: "text-[var(--git-modified)]",
    dot: "bg-[var(--git-modified)]",
  },
  deleted: {
    letter: "D",
    text: "text-[var(--git-deleted)]",
    dot: "bg-[var(--git-deleted)]",
    strike: true,
  },
  renamed: { letter: "R", ...UNTRACKED },
  added: { letter: "A", text: "text-[var(--git-added)]", dot: "bg-[var(--git-added)]" },
  untracked: { letter: "U", ...UNTRACKED },
};

export function decorationOf(status: string): Decoration {
  return DECORATIONS[status] ?? DECORATIONS.modified;
}

// Which status a folder shows when the files under it disagree.
const PRIORITY = ["modified", "deleted", "renamed", "added", "untracked"];

function rank(status: string): number {
  const i = PRIORITY.indexOf(status);
  return i < 0 ? PRIORITY.length : i;
}

export function decorate(files: readonly ChangedFile[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    out.set(file.path, file.status);
    for (const dir of ancestorsOf(file.path)) {
      const current = out.get(dir);
      if (current === undefined || rank(file.status) < rank(current)) out.set(dir, file.status);
    }
  }
  return out;
}
