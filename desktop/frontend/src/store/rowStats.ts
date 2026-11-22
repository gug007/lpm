import { create } from "zustand";
import type { RowStats } from "../sidebarRowDetails";

// Each project's checkout as its sidebar row describes it, keyed by root.
interface RowStatsState {
  entries: Record<string, RowStats>;
  set: (root: string, stats: RowStats) => void;
  retain: (roots: string[]) => void;
}

const same = (a: RowStats | undefined, b: RowStats) =>
  !!a &&
  a.branch === b.branch &&
  a.defaultBranch === b.defaultBranch &&
  a.insertions === b.insertions &&
  a.deletions === b.deletions &&
  a.files === b.files &&
  a.lastCommitAt === b.lastCommitAt &&
  a.version === b.version;

export const useRowStats = create<RowStatsState>((set) => ({
  entries: {},
  set: (root, stats) =>
    set((s) => (same(s.entries[root], stats) ? s : { entries: { ...s.entries, [root]: stats } })),
  retain: (roots) =>
    set((s) => {
      const keep = new Set(roots);
      if (Object.keys(s.entries).every((root) => keep.has(root))) return s;
      return { entries: Object.fromEntries(Object.entries(s.entries).filter(([root]) => keep.has(root))) };
    }),
}));
