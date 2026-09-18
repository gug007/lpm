// Git status on the tree the way VS Code's explorer shows it: a changed file's
// name takes its status colour and a letter, and a folder holding changes takes
// the colour of its most telling file and a dot. The hex values are VS Code's
// own git colours, as the app's dark theme resolves them.
import type { ChangedFile } from "./projects";
import { ancestorsOf } from "./files-model";

export type GitStatus = ChangedFile["status"];

export interface Decoration {
  letter: string;
  text: string;
  dot: string;
  strike?: boolean;
}

export const DECORATIONS: Record<GitStatus, Decoration> = {
  modified: { letter: "M", text: "text-[#e2c08d]", dot: "bg-[#e2c08d]" },
  added: { letter: "A", text: "text-[#81b88b]", dot: "bg-[#81b88b]" },
  deleted: { letter: "D", text: "text-[#c74e39]", dot: "bg-[#c74e39]", strike: true },
};

export function decorationOf(status: GitStatus): Decoration {
  return DECORATIONS[status] ?? DECORATIONS.modified;
}

// Which status a folder shows when the files under it disagree.
const PRIORITY: GitStatus[] = ["modified", "deleted", "added"];

function rank(status: GitStatus): number {
  const i = PRIORITY.indexOf(status);
  return i < 0 ? PRIORITY.length : i;
}

export function decorate(files: readonly ChangedFile[]): ReadonlyMap<string, GitStatus> {
  const out = new Map<string, GitStatus>();
  for (const file of files) {
    out.set(file.path, file.status);
    for (const dir of ancestorsOf(file.path)) {
      const current = out.get(dir);
      if (current === undefined || rank(file.status) < rank(current)) out.set(dir, file.status);
    }
  }
  return out;
}
