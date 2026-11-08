import { create } from "zustand";

const STORAGE_KEY = "lpm.mergedCopies.dismissed";

export interface MergedCopy {
  number: number;
  title: string;
  // No uncommitted or untracked files, so removing the copy loses nothing.
  clean: boolean;
}

// A copy's name and the pull request whose offer was turned down: the next
// copy to reuse the name, or a later merge, is offered again.
type Dismissed = Record<string, number>;

function load(): Dismissed {
  try {
    if (typeof localStorage === "undefined") return {};
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function save(dismissed: Dismissed): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}

const sameCopy = (a: MergedCopy | undefined, b: MergedCopy | null) =>
  (!a && !b) || (a && b && a.number === b.number && a.title === b.title && a.clean === b.clean);

// Duplicates and worktrees whose pull request has merged, keyed by project root.
interface MergedCopiesState {
  entries: Record<string, MergedCopy>;
  dismissed: Dismissed;
  setEntry: (root: string, copy: MergedCopy | null) => void;
  retain: (roots: string[]) => void;
  dismiss: (copies: { name: string; number: number }[]) => void;
}

export const useMergedCopies = create<MergedCopiesState>((set, get) => ({
  entries: {},
  dismissed: load(),
  setEntry: (root, copy) =>
    set((s) => {
      if (sameCopy(s.entries[root], copy)) return s;
      const entries = { ...s.entries };
      if (copy) entries[root] = copy;
      else delete entries[root];
      return { entries };
    }),
  retain: (roots) =>
    set((s) => {
      const keep = new Set(roots);
      if (Object.keys(s.entries).every((root) => keep.has(root))) return s;
      return { entries: Object.fromEntries(Object.entries(s.entries).filter(([root]) => keep.has(root))) };
    }),
  dismiss: (copies) => {
    const dismissed = { ...get().dismissed };
    for (const { name, number } of copies) dismissed[name] = number;
    save(dismissed);
    set({ dismissed });
  },
}));
