import { create } from "zustand";
import { sameOriginStatus, type OriginStatus } from "../originStatus";

// Each local project's standing against origin, keyed by project root. `running`
// covers a pull started from the sidebar; `done` is the short confirmation the
// row shows once it lands.
export interface OriginEntry {
  status: OriginStatus;
  running: boolean;
  done?: string;
}

interface OriginState {
  entries: Record<string, OriginEntry>;
  setStatus: (root: string, status: OriginStatus) => void;
  setRunning: (root: string, running: boolean) => void;
  setDone: (root: string, done: string | undefined) => void;
  retain: (roots: string[]) => void;
  reset: () => void;
}

const patch = (
  entries: Record<string, OriginEntry>,
  root: string,
  change: Partial<OriginEntry>,
): Record<string, OriginEntry> => {
  const current = entries[root];
  if (!current) return entries;
  return { ...entries, [root]: { ...current, ...change } };
};

export const useOriginStatus = create<OriginState>((set) => ({
  entries: {},
  setStatus: (root, status) =>
    set((s) => {
      const current = s.entries[root];
      if (sameOriginStatus(current?.status, status)) return s;
      return { entries: { ...s.entries, [root]: { running: current?.running ?? false, done: current?.done, status } } };
    }),
  setRunning: (root, running) => set((s) => ({ entries: patch(s.entries, root, { running }) })),
  setDone: (root, done) => set((s) => ({ entries: patch(s.entries, root, { done }) })),
  retain: (roots) =>
    set((s) => {
      const keep = new Set(roots);
      if (Object.keys(s.entries).every((root) => keep.has(root))) return s;
      return {
        entries: Object.fromEntries(Object.entries(s.entries).filter(([root]) => keep.has(root))),
      };
    }),
  reset: () => set({ entries: {} }),
}));
